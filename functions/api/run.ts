import { z } from 'zod'
import { agentInstructions } from '../agent/instructions.generated.ts'
import { mockModel } from '../agent/mockModel.ts'
import { createNebiusModel, NebiusModelError } from '../agent/nebiusModel.ts'
import { ProjectWorkspace, projectFilesSchema } from '../agent/projectFiles.ts'
import { runAgent, type AgentModel } from '../agent/runtime.ts'
import { agentTools } from '../agent/tools.ts'

interface Env {
  MOCK_MODE?: string
  NEBIUS_API_KEY?: string
  NEBIUS_MAX_TOKENS?: string
  NEBIUS_MODEL?: string
}

interface PagesContext {
  request: Request
  env: Env
}

const requestSchema = z.object({
  task: z.string().trim().min(1).max(2000),
  files: projectFilesSchema,
}).strict()

const maxRequestBytes = 512 * 1024
const defaultMaxTokens = 600
const maxAllowedTokens = 2048

async function readTextAtMost(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<string | null> {
  if (!body) return ''

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    byteLength += value.byteLength
    if (byteLength > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status })
}

function isLocalRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)
}

export const onRequestPost = async ({ request, env }: PagesContext): Promise<Response> => {
  const text = await readTextAtMost(request.body, maxRequestBytes)
  if (text === null) {
    return errorResponse(413, 'request_too_large', 'Request body must be 512 KB or smaller.')
  }

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return errorResponse(400, 'invalid_json', 'Request body must be valid JSON.')
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse(400, 'invalid_request', 'Provide a task and valid project files.')
  }

  const workspace = new ProjectWorkspace(parsed.data.files)
  if (workspace.snapshot()['index.html']) {
    return errorResponse(
      409,
      'editing_not_available',
      'This milestone supports initial website generation only. Existing projects are preserved and not rewritten.',
    )
  }

  const useLocalMock = env.MOCK_MODE === 'true' && isLocalRequest(request)
  const apiKey = env.NEBIUS_API_KEY?.trim()
  const modelId = env.NEBIUS_MODEL?.trim()
  const configuredMaxTokens = env.NEBIUS_MAX_TOKENS?.trim()
  const maxTokens = configuredMaxTokens ? Number(configuredMaxTokens) : defaultMaxTokens
  let model: AgentModel
  let responseModel: string
  if (useLocalMock) {
    model = mockModel
    responseModel = 'local-deterministic-mock'
  } else {
    if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > maxAllowedTokens) {
      return errorResponse(
        500,
        'invalid_token_limit',
        `NEBIUS_MAX_TOKENS must be an integer between 1 and ${maxAllowedTokens}.`,
      )
    }
    if (!apiKey || !modelId) {
      return errorResponse(
        503,
        'credentials_missing',
        'Configure NEBIUS_API_KEY and NEBIUS_MODEL on the server before running the live agent.',
      )
    }
    model = createNebiusModel({
      apiKey,
      model: modelId,
      maxTokens,
      signal: request.signal,
    })
    responseModel = modelId
  }

  try {
    const result = await runAgent({
      task: parsed.data.task,
      businesses: [],
      model,
      tools: agentTools,
      instructions: agentInstructions,
      workspace,
    })
    const files = workspace.snapshot()
    if (!files['index.html']) {
      return errorResponse(
        502,
        'website_not_generated',
        'The model completed without creating the required index.html project file.',
      )
    }

    return Response.json({
      mode: useLocalMock ? 'mock' : 'live',
      agentName: 'ChaosPilot Website Agent',
      liveModel: !useLocalMock,
      model: responseModel,
      files,
      ...result,
    })
  } catch (error) {
    if (error instanceof NebiusModelError) {
      return errorResponse(error.status, error.code, error.message)
    }
    return errorResponse(500, 'agent_run_failed', 'The agent run failed unexpectedly.')
  }
}
import { z } from 'zod'
import { agentInstructions } from '../agent/instructions.generated'
import { createNebiusModel, NebiusModelError } from '../agent/nebiusModel'
import { runAgent } from '../agent/runtime'
import { agentSkills } from '../agent/skills/registry'
import { agentTools } from '../agent/tools'

interface Env {
  NEBIUS_API_KEY?: string
  NEBIUS_MAX_TOKENS?: string
  NEBIUS_MODEL?: string
}

interface PagesContext {
  request: Request
  env: Env
}

const requestSchema = z.object({
  task: z.string().trim().min(1).max(1200),
  businesses: z.array(z.object({
    id: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(120),
    url: z.string().url().max(2048),
  }).strict()).max(3),
}).strict()

const maxRequestBytes = 8 * 1024
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

export const onRequestPost = async ({ request, env }: PagesContext): Promise<Response> => {
  const text = await readTextAtMost(request.body, maxRequestBytes)
  if (text === null) {
    return errorResponse(413, 'request_too_large', 'Request body must be 8 KB or smaller.')
  }

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return errorResponse(400, 'invalid_json', 'Request body must be valid JSON.')
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse(400, 'invalid_request', 'Provide a task and up to three businesses.')
  }

  const hasUnsafeUrl = parsed.data.businesses.some((business) => {
    const url = new URL(business.url)
    return (url.protocol !== 'https:' && url.protocol !== 'http:')
      || Boolean(url.username || url.password)
  })
  if (hasUnsafeUrl) {
    return errorResponse(400, 'invalid_business_url', 'Business URLs must use HTTP(S) and contain no credentials.')
  }

  const apiKey = env.NEBIUS_API_KEY?.trim()
  const modelId = env.NEBIUS_MODEL?.trim()
  const configuredMaxTokens = env.NEBIUS_MAX_TOKENS?.trim()
  const maxTokens = configuredMaxTokens ? Number(configuredMaxTokens) : defaultMaxTokens

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

  try {
    const result = await runAgent({
      task: parsed.data.task,
      businesses: parsed.data.businesses,
      model: createNebiusModel({
        apiKey,
        model: modelId,
        maxTokens,
        signal: request.signal,
      }),
      tools: agentTools,
      instructions: agentInstructions,
      skills: agentSkills,
    })

    return Response.json({
      mode: 'live',
      agentName: 'Website Growth Agent',
      liveModel: true,
      liveWebsiteFetch: false,
      model: modelId,
      ...result,
    })
  } catch (error) {
    if (error instanceof NebiusModelError) {
      return errorResponse(error.status, error.code, error.message)
    }
    return errorResponse(500, 'agent_run_failed', 'The agent run failed unexpectedly.')
  }
}
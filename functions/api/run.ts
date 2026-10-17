import { z } from 'zod'
import { agentInstructions } from '../agent/instructions.generated.ts'
import { mockModel } from '../agent/mockModel.ts'
import { readTextAtMost } from '../agent/http.ts'
import { selectModel, type ModelEnv } from '../agent/modelConfig.ts'
import { NebiusModelError } from '../agent/nebiusModel.ts'
import { ProjectWorkspace, projectFilesSchema } from '../agent/projectFiles.ts'
import { runAgent } from '../agent/runtime.ts'
import { agentTools } from '../agent/tools.ts'

interface PagesContext {
  request: Request
  env: ModelEnv
}

const requestSchema = z.object({
  task: z.string().trim().min(1).max(2000),
  files: projectFilesSchema,
}).strict()

const maxRequestBytes = 512 * 1024
const defaultMaxTokens = 600

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status })
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

  const selection = selectModel({ env, request, mockModel, defaultMaxTokens })
  if (!selection.ok) return errorResponse(selection.status, selection.code, selection.message)
  const useLocalMock = selection.mode === 'mock'
  const { model, modelName: responseModel } = selection

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
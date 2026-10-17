// Handler for POST /api/audit — inspects up to three submitted websites with allowlisted
// server-side tools and streams each step to the browser as NDJSON.

import { auditRequestSchema, type AuditBusiness, type AuditStreamEvent } from './auditSchema.ts'
import { auditMockModel } from './auditMockModel.ts'
import { AuditRunState, createAuditTools } from './auditTools.ts'
import { readTextAtMost } from './http.ts'
import { auditAgentInstructions } from './instructions.generated.ts'
import { selectModel, type ModelEnv } from './modelConfig.ts'
import { NebiusModelError } from './nebiusModel.ts'
import { ProjectWorkspace } from './projectFiles.ts'
import { AgentCancelledError, runAgent } from './runtime.ts'

export interface PagesContext {
  request: Request
  env: ModelEnv
}

export type AuditDependencies = {
  fetchImplementation?: typeof fetch
}

const maxRequestBytes = 16 * 1024
const defaultMaxTokens = 3000
export const auditMaxTurns = 12
export const auditMaxToolCalls = 16

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status })
}

function stripReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*<\/think>/i, '').trim()
}

export async function handleAudit(
  { request, env }: PagesContext,
  dependencies: AuditDependencies = {},
): Promise<Response> {
  const text = await readTextAtMost(request.body, maxRequestBytes)
  if (text === null) return errorResponse(413, 'request_too_large', 'Request body must be 16 KB or smaller.')

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return errorResponse(400, 'invalid_json', 'Request body must be valid JSON.')
  }

  const parsed = auditRequestSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue?.path.length ? `${issue.path.join('.')}: ` : ''
    return errorResponse(400, 'invalid_request', `${where}${issue?.message ?? 'Provide a task and 1–3 businesses.'}`)
  }

  const controller = new AbortController()
  request.signal?.addEventListener('abort', () => controller.abort(), { once: true })

  const selection = selectModel({
    env,
    request,
    mockModel: auditMockModel,
    defaultMaxTokens,
    maxTokensVariable: 'NEBIUS_AUDIT_MAX_TOKENS',
    signal: controller.signal,
  })
  if (!selection.ok) return errorResponse(selection.status, selection.code, selection.message)

  const businesses: AuditBusiness[] = parsed.data.businesses.map((business, index) => ({
    id: `b${index + 1}`,
    name: business.name,
    url: business.url,
  }))
  const state = new AuditRunState(businesses)
  const tools = createAuditTools({
    state,
    fetchImplementation: dependencies.fetchImplementation,
    signal: controller.signal,
  })

  const stream = new TransformStream<Uint8Array, Uint8Array>()
  const writer = stream.writable.getWriter()
  const encoder = new TextEncoder()
  let open = true
  const send = (event: AuditStreamEvent) => {
    if (!open) return
    writer.write(encoder.encode(`${JSON.stringify(event)}\n`)).catch(() => {
      // The browser disconnected or cancelled: stop model calls and fetches.
      open = false
      controller.abort()
    })
  }

  const run = async () => {
    send({ type: 'run_started', mode: selection.mode, model: selection.modelName, businesses })
    try {
      const result = await runAgent({
        task: [
          parsed.data.task,
          '',
          'Businesses (use business_id in tool calls):',
          ...businesses.map((business) => `- ${business.id}: ${business.name} — ${business.url}`),
        ].join('\n'),
        businesses,
        model: selection.model,
        tools,
        instructions: auditAgentInstructions,
        workspace: new ProjectWorkspace({}),
        maxTurns: auditMaxTurns,
        maxToolCalls: auditMaxToolCalls,
        signal: controller.signal,
        onEvent: (event) => send(event),
        reviewFinal: () => {
          const missing = businesses.filter((business) =>
            state.inspections.get(business.id)?.homepage && !state.proposals.has(business.id))
          return missing.length === 0 ? null : [
            `Not finished: no proposal has been saved for ${missing.map((business) => `${business.name} (${business.id})`).join(', ')}.`,
            'Call the save_proposal tool now for each of them, with findings as a JSON array. Do not write proposals as plain text; text answers are not saved.',
          ].join(' ')
        },
      })

      const inspections = state.inspectionSummaries()
      const proposals = businesses.flatMap((business) => {
        const proposal = state.proposals.get(business.id)
        return proposal ? [proposal] : []
      })
      const warnings: string[] = []
      for (const inspection of inspections) {
        const name = businesses.find((business) => business.id === inspection.businessId)?.name ?? inspection.businessId
        if (inspection.status === 'not_inspected') warnings.push(`${name} was not inspected by the agent.`)
        else if (inspection.status === 'failed') warnings.push(`${name} could not be inspected: ${inspection.error}`)
        else if (!state.proposals.has(inspection.businessId)) warnings.push(`The agent did not save a proposal for ${name}.`)
      }
      if (result.stopReason !== 'final') warnings.push(result.answer)

      send({
        type: 'result',
        answer: stripReasoning(result.answer) || 'The agent finished without a written summary.',
        proposals,
        inspections,
        turns: result.turns,
        stopReason: result.stopReason,
        warnings,
      })
    } catch (error) {
      if (error instanceof AgentCancelledError || controller.signal.aborted) {
        send({ type: 'error', code: 'request_cancelled', message: 'The run was cancelled.' })
      } else if (error instanceof NebiusModelError) {
        send({ type: 'error', code: error.code, message: error.message })
      } else {
        send({ type: 'error', code: 'agent_run_failed', message: 'The agent run failed unexpectedly.' })
      }
    } finally {
      open = false
      await writer.close().catch(() => undefined)
    }
  }

  void run()

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

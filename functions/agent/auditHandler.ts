// Handler for POST /api/audit — inspects one submitted website with allowlisted
// server-side tools and streams each step to the browser as NDJSON.

import { auditRequestSchema, type AuditBusiness } from './auditSchema.ts'
import { auditMockModel } from './auditMockModel.ts'
import { AuditRunState, createAuditTools } from './auditTools.ts'
import { auditAgentInstructions } from './instructions.generated.ts'
import { selectModel, type ModelEnv } from './modelConfig.ts'
import { runAgent } from './runtime.ts'
import { createStreamingResponse, errorResponse, parseRequest, stripReasoning } from './streamRun.ts'

export interface PagesContext {
  request: Request
  env: ModelEnv
}

export type AuditDependencies = {
  fetchImplementation?: typeof fetch
}

const defaultMaxTokens = 3000
export const auditMaxTurns = 12
export const auditMaxToolCalls = 16

export async function handleAudit(
  { request, env }: PagesContext,
  dependencies: AuditDependencies = {},
): Promise<Response> {
  const parsed = await parseRequest(request, auditRequestSchema, 'Provide a task and one business website.')
  if (!parsed.ok) return parsed.response

  const controller = new AbortController()
  request.signal?.addEventListener('abort', () => controller.abort(), { once: true })

  const selection = selectModel({ env, request, mockModel: auditMockModel, defaultMaxTokens, signal: controller.signal })
  if (!selection.ok) return errorResponse(selection.status, selection.code, selection.message)

  const businesses: AuditBusiness[] = parsed.data.businesses.map((business, index) => ({
    id: `b${index + 1}`,
    name: business.name,
    url: business.url,
  }))
  const state = new AuditRunState(businesses)
  const tools = createAuditTools({ state, fetchImplementation: dependencies.fetchImplementation, signal: controller.signal })

  return createStreamingResponse(controller, async (send) => {
    send({ type: 'run_started', mode: selection.mode, model: selection.modelName, businesses })
    const result = await runAgent({
      task: [
        parsed.data.task,
        '',
        'Business (use business_id in tool calls):',
        ...businesses.map((business) => `- ${business.id}: ${business.name} — ${business.url}`),
      ].join('\n'),
      businesses,
      model: selection.model,
      tools,
      instructions: auditAgentInstructions,
      maxTurns: auditMaxTurns,
      maxToolCalls: auditMaxToolCalls,
      signal: controller.signal,
      onEvent: (event) => send(event),
      reviewFinal: () => {
        const missing = businesses.filter((business) =>
          state.inspections.get(business.id)?.homepage && !state.proposals.has(business.id))
        return missing.length === 0 ? null : [
          `Not finished: no proposal has been saved for ${missing.map((business) => `${business.name} (${business.id})`).join(', ')}.`,
          'Call the save_proposal tool now, with findings as a JSON array. Do not write the proposal as plain text; text answers are not saved.',
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
      comparison: null,
      inspections,
      turns: result.turns,
      stopReason: result.stopReason,
      warnings,
    })
  })
}

// Handler for POST /api/compare — inspects two submitted websites with the same
// tools and scoring, then streams the model's comparison as NDJSON. It is a
// separate endpoint from /api/audit so the two workflows never share state.

import { compareRequestSchema, type AuditBusiness } from './auditSchema.ts'
import { AuditRunState, createCompareTools } from './auditTools.ts'
import { compareMockModel } from './compareMockModel.ts'
import { compareAgentInstructions } from './instructions.generated.ts'
import { selectModel } from './modelConfig.ts'
import { runAgent } from './runtime.ts'
import { createStreamingResponse, errorResponse, parseRequest, stripReasoning } from './streamRun.ts'
import type { AuditDependencies, PagesContext } from './auditHandler.ts'

const defaultMaxTokens = 3000
export const compareMaxTurns = 8
export const compareMaxToolCalls = 6

export async function handleCompare(
  { request, env }: PagesContext,
  dependencies: AuditDependencies = {},
): Promise<Response> {
  const parsed = await parseRequest(request, compareRequestSchema, 'Provide a task and two websites to compare.')
  if (!parsed.ok) return parsed.response

  const controller = new AbortController()
  request.signal?.addEventListener('abort', () => controller.abort(), { once: true })

  const selection = selectModel({ env, request, mockModel: compareMockModel, defaultMaxTokens, signal: controller.signal })
  if (!selection.ok) return errorResponse(selection.status, selection.code, selection.message)

  const businesses: AuditBusiness[] = parsed.data.businesses.map((business, index) => ({
    id: `b${index + 1}`,
    name: business.name,
    url: business.url,
  }))
  const state = new AuditRunState(businesses)
  const tools = createCompareTools({ state, fetchImplementation: dependencies.fetchImplementation, signal: controller.signal })

  return createStreamingResponse(controller, async (send) => {
    send({ type: 'run_started', mode: selection.mode, model: selection.modelName, businesses })
    const result = await runAgent({
      task: [
        parsed.data.task,
        '',
        'Websites to compare (use business_id in tool calls):',
        `- site A, ${businesses[0].id}: ${businesses[0].name} — ${businesses[0].url}`,
        `- site B, ${businesses[1].id}: ${businesses[1].name} — ${businesses[1].url}`,
      ].join('\n'),
      businesses,
      model: selection.model,
      tools,
      instructions: compareAgentInstructions,
      maxTurns: compareMaxTurns,
      maxToolCalls: compareMaxToolCalls,
      signal: controller.signal,
      onEvent: (event) => send(event),
      reviewFinal: () => {
        const bothInspected = businesses.every((business) => state.inspections.get(business.id)?.homepage)
        return bothInspected && !state.comparison
          ? 'Not finished: the comparison has not been saved. Call the save_comparison tool now, with differences and priorities as JSON arrays. Do not write the comparison as plain text; text answers are not saved.'
          : null
      },
    })

    const inspections = state.inspectionSummaries()
    const warnings: string[] = []
    for (const inspection of inspections) {
      const name = businesses.find((business) => business.id === inspection.businessId)?.name ?? inspection.businessId
      if (inspection.status === 'not_inspected') warnings.push(`${name} was not inspected by the agent.`)
      else if (inspection.status === 'failed') warnings.push(`${name} could not be inspected: ${inspection.error}`)
    }
    if (!state.comparison && inspections.every((inspection) => inspection.status === 'inspected')) {
      warnings.push('The agent did not save a written comparison. The scores below are still accurate.')
    }
    if (result.stopReason !== 'final') warnings.push(result.answer)

    send({
      type: 'result',
      answer: stripReasoning(result.answer) || 'The agent finished without a written summary.',
      proposals: [],
      comparison: state.comparison,
      inspections,
      turns: result.turns,
      stopReason: result.stopReason,
      warnings,
    })
  })
}

import { z } from 'zod'
import {
  auditBusinessSchema,
  auditStreamEventSchema,
  inspectionSummarySchema,
  proposalSchema,
  type AuditRequest,
  type AuditStreamEvent,
  type Proposal,
} from '../../functions/agent/auditSchema.ts'

export const timelineStepSchema = z.object({
  id: z.string(),
  turn: z.number(),
  name: z.string(),
  input: z.unknown(),
  status: z.enum(['running', 'completed', 'error']),
  output: z.string().optional(),
  durationMs: z.number().optional(),
})
export type TimelineStep = z.infer<typeof timelineStepSchema>

const resultSchema = z.object({
  answer: z.string(),
  proposals: z.array(proposalSchema),
  inspections: z.array(inspectionSummarySchema),
  turns: z.number(),
  stopReason: z.enum(['final', 'turn_limit', 'tool_call_limit']),
  warnings: z.array(z.string()),
})
export type AuditResult = z.infer<typeof resultSchema>

export const auditRunSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  request: z.object({
    task: z.string(),
    businesses: z.array(z.object({ name: z.string(), url: z.string() })),
  }),
  status: z.enum(['running', 'completed', 'error', 'cancelled']),
  mode: z.enum(['live', 'mock']).nullable(),
  model: z.string().nullable(),
  businesses: z.array(auditBusinessSchema),
  turns: z.number(),
  steps: z.array(timelineStepSchema),
  result: resultSchema.nullable(),
  error: z.string().nullable(),
  editedBusinessIds: z.array(z.string()),
})
export type AuditRun = z.infer<typeof auditRunSchema>

export function createRun(request: AuditRequest, id: string, createdAt: string): AuditRun {
  return {
    id,
    createdAt,
    request,
    status: 'running',
    mode: null,
    model: null,
    businesses: [],
    turns: 0,
    steps: [],
    result: null,
    error: null,
    editedBusinessIds: [],
  }
}

/** Applies one server stream event to the run shown in the browser. */
export function applyAuditEvent(run: AuditRun, event: AuditStreamEvent): AuditRun {
  switch (event.type) {
    case 'run_started':
      return { ...run, mode: event.mode, model: event.model, businesses: event.businesses }
    case 'model_turn':
      return { ...run, turns: Math.max(run.turns, event.turn) }
    case 'tool_started':
      return {
        ...run,
        steps: [...run.steps, { id: event.id, turn: event.turn, name: event.name, input: event.input, status: 'running' }],
      }
    case 'tool_finished': {
      const { step } = event
      const finished: TimelineStep = {
        id: step.id,
        turn: event.turn,
        name: step.name,
        input: step.input,
        status: step.status,
        output: step.output,
        durationMs: step.durationMs,
      }
      const index = run.steps.findIndex((candidate) => candidate.id === step.id && candidate.status === 'running')
      const steps = index === -1
        ? [...run.steps, finished]
        : run.steps.map((candidate, candidateIndex) => candidateIndex === index ? finished : candidate)
      return { ...run, steps }
    }
    case 'result':
      return {
        ...run,
        status: 'completed',
        turns: Math.max(run.turns, event.turns),
        result: {
          answer: event.answer,
          proposals: event.proposals,
          inspections: event.inspections,
          turns: event.turns,
          stopReason: event.stopReason,
          warnings: event.warnings,
        },
      }
    case 'error':
      return {
        ...finishRunningSteps(run, event.code === 'request_cancelled' ? 'Cancelled.' : 'Stopped because the run failed.'),
        status: event.code === 'request_cancelled' ? 'cancelled' : 'error',
        error: event.message,
      }
  }
}

export function finishRunningSteps(run: AuditRun, message: string): AuditRun {
  return {
    ...run,
    steps: run.steps.map((step) => step.status === 'running'
      ? { ...step, status: 'error', output: JSON.stringify({ error: message }) }
      : step),
  }
}

export function updateProposal(run: AuditRun, businessId: string, changes: Partial<Pick<Proposal, 'emailSubject' | 'emailBody'>>): AuditRun {
  if (!run.result) return run
  return {
    ...run,
    editedBusinessIds: run.editedBusinessIds.includes(businessId) ? run.editedBusinessIds : [...run.editedBusinessIds, businessId],
    result: {
      ...run.result,
      proposals: run.result.proposals.map((proposal) => proposal.businessId === businessId ? { ...proposal, ...changes } : proposal),
    },
  }
}

export class AuditStreamError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuditStreamError'
  }
}

/** Incremental NDJSON parser that validates every event with the shared schema. */
export function createEventParser(onEvent: (event: AuditStreamEvent) => void) {
  let buffer = ''
  let sawTerminal = false

  function handleLine(line: string) {
    if (!line.trim()) return
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      throw new AuditStreamError('The server sent malformed progress data.')
    }
    const parsed = auditStreamEventSchema.safeParse(value)
    if (!parsed.success) throw new AuditStreamError('The server sent an unexpected progress event.')
    if (parsed.data.type === 'result' || parsed.data.type === 'error') sawTerminal = true
    onEvent(parsed.data)
  }

  return {
    push(chunk: string) {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) handleLine(line)
    },
    end() {
      handleLine(buffer)
      buffer = ''
      if (!sawTerminal) throw new AuditStreamError('The connection closed before the agent returned a result.')
    },
  }
}

export async function streamAudit(
  request: AuditRequest,
  options: { signal: AbortSignal; onEvent: (event: AuditStreamEvent) => void; fetchImplementation?: typeof fetch },
): Promise<void> {
  const response = await (options.fetchImplementation ?? fetch)('/api/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: options.signal,
  })

  if (!response.ok) {
    let message = `The audit endpoint returned HTTP ${response.status}.`
    try {
      const body = await response.json() as { error?: { message?: unknown } }
      if (typeof body.error?.message === 'string') message = body.error.message
    } catch {
      // Keep the status-based message.
    }
    throw new AuditStreamError(message)
  }
  if (!response.body || !/ndjson/i.test(response.headers.get('content-type') ?? '')) {
    throw new AuditStreamError('The audit endpoint did not return a progress stream. Is the Pages Functions server running?')
  }

  const parser = createEventParser(options.onEvent)
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    parser.push(value)
  }
  parser.end()
}

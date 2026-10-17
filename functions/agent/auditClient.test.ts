import assert from 'node:assert/strict'
import test from 'node:test'
import type { AuditStreamEvent } from './auditSchema.ts'
import { applyAuditEvent, createEventParser, createRun, streamAudit, updateProposal } from '../../src/audit/auditRun.ts'
import { auditHistoryKey, loadHistory, maxHistoryEntries, saveHistory, upsertRun } from '../../src/audit/auditHistory.ts'

const request = { task: 'Audit', businesses: [{ name: 'Kopi', url: 'https://kopicorner.com' }] }

const events: AuditStreamEvent[] = [
  { type: 'run_started', mode: 'live', model: 'nvidia/test-model', businesses: [{ id: 'b1', name: 'Kopi', url: 'https://kopicorner.com' }] },
  { type: 'model_turn', turn: 1 },
  { type: 'tool_started', turn: 1, id: 'c1', name: 'inspect_website', input: { business_id: 'b1' } },
  { type: 'tool_finished', turn: 1, step: { id: 'c1', name: 'inspect_website', input: { business_id: 'b1' }, output: '{}', status: 'completed', durationMs: 300 } },
  {
    type: 'result',
    answer: 'Done',
    proposals: [{ businessId: 'b1', summary: 'Summary text', findings: [], emailSubject: 'Hi', emailBody: 'Body' }],
    inspections: [],
    turns: 3,
    stopReason: 'final',
    warnings: [],
  },
]

test('event parser handles lines split across chunks and validates each event', () => {
  const received: AuditStreamEvent[] = []
  const parser = createEventParser((event) => received.push(event))
  const text = events.map((event) => JSON.stringify(event)).join('\n')
  for (let index = 0; index < text.length; index += 7) parser.push(text.slice(index, index + 7))
  parser.end()
  assert.deepEqual(received.map((event) => event.type), events.map((event) => event.type))

  assert.throws(() => createEventParser(() => undefined).push('{"type":"unknown"}\n'), /unexpected progress event/)
  assert.throws(() => createEventParser(() => undefined).push('not json\n'), /malformed/)
  const unterminated = createEventParser(() => undefined)
  unterminated.push(`${JSON.stringify(events[0])}\n`)
  assert.throws(() => unterminated.end(), /closed before/)
})

test('applying stream events builds the live run state', () => {
  let run = createRun(request, 'r1', '2026-10-18T00:00:00.000Z')
  run = applyAuditEvent(run, events[0])
  run = applyAuditEvent(run, events[1])
  run = applyAuditEvent(run, events[2])
  assert.equal(run.steps[0].status, 'running')
  run = applyAuditEvent(run, events[3])
  assert.equal(run.steps.length, 1)
  assert.equal(run.steps[0].status, 'completed')
  assert.equal(run.steps[0].durationMs, 300)
  run = applyAuditEvent(run, events[4])
  assert.equal(run.status, 'completed')
  assert.equal(run.turns, 3)
  assert.equal(run.model, 'nvidia/test-model')

  const edited = updateProposal(run, 'b1', { emailBody: 'Edited body' })
  assert.equal(edited.result?.proposals[0].emailBody, 'Edited body')
  assert.deepEqual(edited.editedBusinessIds, ['b1'])

  const failed = applyAuditEvent(applyAuditEvent(createRun(request, 'r2', 'now'), events[2]), { type: 'error', code: 'upstream_timeout', message: 'Timed out' })
  assert.equal(failed.status, 'error')
  assert.equal(failed.steps[0].status, 'error')
})

test('streamAudit surfaces server error messages and missing streams', async () => {
  const signal = new AbortController().signal
  await assert.rejects(
    streamAudit(request, {
      signal,
      onEvent: () => undefined,
      fetchImplementation: async () => Response.json({ error: { code: 'credentials_missing', message: 'Configure NEBIUS_API_KEY' } }, { status: 503 }),
    }),
    /Configure NEBIUS_API_KEY/,
  )
  await assert.rejects(
    streamAudit(request, { signal, onEvent: () => undefined, fetchImplementation: async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }) }),
    /did not return a progress stream/,
  )
})

test('history keeps valid finished runs, newest first, and survives a full storage quota', () => {
  const store = new Map<string, string>()
  const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value) } }
  let run = createRun(request, 'r1', 'now')
  for (const event of events) run = applyAuditEvent(run, event)

  let history = upsertRun([], run)
  history = upsertRun(history, { ...run, id: 'r2' })
  history = upsertRun(history, { ...run, id: 'r1', status: 'cancelled' })
  assert.deepEqual(history.map((entry) => entry.id), ['r1', 'r2'])
  assert.equal(saveHistory(storage, history), true)
  assert.deepEqual(loadHistory(storage).map((entry) => entry.id), ['r1', 'r2'])

  store.set(auditHistoryKey, JSON.stringify([{ id: 'broken' }, run]))
  assert.deepEqual(loadHistory(storage).map((entry) => entry.id), ['r1'])
  store.set(auditHistoryKey, 'not json')
  assert.deepEqual(loadHistory(storage), [])

  let writes = 0
  const tinyStorage = {
    setItem: (_key: string, value: string) => {
      writes += 1
      if (value.length > JSON.stringify([run]).length) throw new Error('QuotaExceededError')
    },
  }
  assert.equal(saveHistory(tinyStorage, Array.from({ length: maxHistoryEntries + 2 }, (_, index) => ({ ...run, id: `r${index}` }))), true)
  assert.ok(writes > 1)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { auditStreamEventSchema, compareRequestSchema, type AuditStreamEvent } from './auditSchema.ts'
import { AuditRunState, createCompareTools } from './auditTools.ts'
import { handleCompare } from './compareHandler.ts'
import { runAgent, type AgentModel } from './runtime.ts'

const strongPage = `<!doctype html><html lang="en"><head>
  <title>Strong Cafe — fresh coffee in town</title>
  <meta name="viewport" content="width=device-width">
  <meta name="description" content="Strong Cafe serves freshly roasted coffee, pastries and breakfast every morning in the heart of the town centre.">
  <meta property="og:title" content="Strong"><meta property="og:image" content="/og.png">
  </head><body><h1>Fresh coffee daily</h1><h2>Menu</h2><img src="a.jpg" alt="Latte">
  <a href="/order">Order now</a><a href="tel:+601">Call us</a>
  <p>${'Coffee roasted every morning with care and patience. '.repeat(30)}</p></body></html>`
const weakPage = '<html><head><title>Weak</title></head><body><p>Hello there</p></body></html>'

const siteFetch: typeof fetch = async (input) => {
  const url = String(input)
  if (url.includes('broken-site.com')) return new Response('down', { status: 500 })
  return new Response(url.includes('strong-site.com') ? strongPage : weakPage, { headers: { 'content-type': 'text/html' } })
}

const businesses = [
  { id: 'b1', name: 'Strong Cafe', url: 'https://strong-site.com/' },
  { id: 'b2', name: 'Weak Cafe', url: 'https://weak-site.com/' },
]
const context = { businesses }

const validComparison = {
  summary: 'Strong Cafe scores far higher than Weak Cafe because it has a description and calls to action.',
  differences: [
    { aspect: 'Meta description', site_a: 'metaDescription: 118 characters', site_b: 'metaDescription: null', takeaway: 'Only Strong Cafe has a search snippet.' },
    { aspect: 'Calls to action', site_a: 'callsToAction: Order now', site_b: 'callsToAction: []', takeaway: 'Weak Cafe gives visitors no next step.' },
  ],
  priorities: ['Weak Cafe: add a meta description.', 'Weak Cafe: add a clear call to action.'],
}

function request(url: string, body: unknown): Request {
  return new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

async function readEvents(response: Response): Promise<AuditStreamEvent[]> {
  return (await response.text()).trim().split('\n').map((line) => auditStreamEventSchema.parse(JSON.parse(line)))
}

test('compare request needs exactly two different, safe websites', () => {
  const ok = { task: 'Compare', businesses: [{ name: 'A', url: 'https://a.com' }, { name: 'B', url: 'https://b.com' }] }
  assert.equal(compareRequestSchema.safeParse(ok).success, true)
  assert.equal(compareRequestSchema.safeParse({ ...ok, businesses: [ok.businesses[0]] }).success, false)
  assert.equal(compareRequestSchema.safeParse({ ...ok, businesses: [...ok.businesses, { name: 'C', url: 'https://c.com' }] }).success, false)
  assert.equal(compareRequestSchema.safeParse({ ...ok, businesses: [ok.businesses[0], { name: 'B', url: 'http://127.0.0.1/' }] }).success, false)

  const same = compareRequestSchema.safeParse({
    ...ok,
    businesses: [{ name: 'A', url: 'https://www.a.com/menu' }, { name: 'B', url: 'https://a.com' }],
  })
  assert.equal(same.success, false)
  assert.match(same.error?.issues[0].message ?? '', /two different websites/)
})

test('save_comparison needs both websites inspected, then stores the comparison', async () => {
  const state = new AuditRunState(businesses)
  const tools = new Map(createCompareTools({ state, fetchImplementation: siteFetch }).map((tool) => [tool.name, tool]))
  assert.deepEqual([...tools.keys()], ['inspect_website', 'save_comparison'])

  await assert.rejects(tools.get('save_comparison')!.execute(validComparison, context), /Both websites must be inspected/)
  await tools.get('inspect_website')!.execute({ business_id: 'b1' }, context)
  await assert.rejects(tools.get('save_comparison')!.execute(validComparison, context), /Weak Cafe \(b2\)/)
  await tools.get('inspect_website')!.execute({ business_id: 'b2' }, context)
  await tools.get('save_comparison')!.execute(validComparison, context)

  assert.equal(state.comparison?.differences.length, 2)
  assert.equal(state.comparison?.differences[0].siteA, 'metaDescription: 118 characters')
  const [a, b] = state.inspectionSummaries()
  assert.ok((a.score?.value ?? 0) > (b.score?.value ?? 100))
})

test('save_comparison accepts arrays sent as JSON strings and rejects invalid arguments with field errors', async () => {
  const state = new AuditRunState(businesses)
  let call = 0
  const model: AgentModel = {
    async decide(input) {
      call += 1
      if (call === 1) {
        return { type: 'tool_calls', toolCalls: businesses.map((business) => ({ id: `i-${business.id}`, name: 'inspect_website', arguments: { business_id: business.id } })) }
      }
      if (call === 2) {
        return { type: 'tool_calls', toolCalls: [{ id: 's1', name: 'save_comparison', arguments: { ...validComparison, differences: JSON.stringify(validComparison.differences), priorities: JSON.stringify(validComparison.priorities) } }] }
      }
      if (call === 3) return { type: 'tool_calls', toolCalls: [{ id: 's2', name: 'save_comparison', arguments: { ...validComparison, differences: [validComparison.differences[0]] } }] }
      const last = input.messages.at(-1)
      return { type: 'final', content: last?.role === 'tool' ? last.content : '' }
    },
  }
  const result = await runAgent({
    task: 'Compare',
    businesses,
    model,
    tools: createCompareTools({ state, fetchImplementation: siteFetch }),
    instructions: 'Test',
  })
  assert.deepEqual(result.trace.map((step) => step.status), ['completed', 'completed', 'completed', 'error'])
  assert.match(result.answer, /differences/)
  assert.equal(state.comparison?.priorities.length, 2)
})

test('local mock comparison streams real fetches, scores both sites and ranks them', async () => {
  const response = await handleCompare({
    request: request('http://localhost:8788/api/compare', {
      task: 'Compare these two websites.',
      businesses: [
        { name: 'Weak Cafe', url: 'https://weak-site.com' },
        { name: 'Strong Cafe', url: 'https://strong-site.com' },
      ],
    }),
    env: { MOCK_MODE: 'true' },
  }, { fetchImplementation: siteFetch })
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /ndjson/)

  const events = await readEvents(response)
  const finished = events.flatMap((event) => event.type === 'tool_finished' ? [event.step] : [])
  assert.deepEqual(finished.map((step) => `${step.name}:${step.status}`), [
    'inspect_website:completed',
    'inspect_website:completed',
    'save_comparison:completed',
  ])

  const result = events.at(-1)
  assert.equal(result?.type, 'result')
  if (result?.type !== 'result') return
  assert.equal(result.proposals.length, 0)
  assert.equal(result.warnings.length, 0)
  assert.ok(result.comparison && result.comparison.differences.length >= 2)
  assert.match(result.comparison.summary, /\[MOCK\]/)
  const [weak, strong] = result.inspections
  assert.ok((strong.score?.value ?? 0) > (weak.score?.value ?? 100))
  assert.match(result.comparison.priorities[0], /Weak Cafe/)
  assert.match(result.answer, /\[MOCK\] Inspected 2 of 2/)
})

test('if one website cannot be fetched there is no comparison and a clear warning', async () => {
  const response = await handleCompare({
    request: request('http://localhost:8788/api/compare', {
      task: 'Compare these two websites.',
      businesses: [
        { name: 'Strong Cafe', url: 'https://strong-site.com' },
        { name: 'Broken Bakery', url: 'https://broken-site.com' },
      ],
    }),
    env: { MOCK_MODE: 'true' },
  }, { fetchImplementation: siteFetch })
  const events = await readEvents(response)
  const result = events.at(-1)
  assert.equal(result?.type, 'result')
  if (result?.type !== 'result') return
  assert.equal(result.comparison, null)
  assert.deepEqual(result.inspections.map((inspection) => inspection.status), ['inspected', 'failed'])
  assert.ok(result.inspections[0].score)
  assert.equal(result.inspections[1].score, null)
  assert.ok(result.warnings.some((warning) => /Broken Bakery could not be inspected/.test(warning)))
  assert.ok(!events.some((event) => event.type === 'tool_finished' && event.step.name === 'save_comparison'))
})

test('compare route validates input and never uses the mock off localhost', async () => {
  const bad = await handleCompare({ request: request('https://chaospilot.test/api/compare', { task: 'x', businesses: [{ name: 'A', url: 'https://a.com' }] }), env: {} })
  assert.equal(bad.status, 400)
  assert.match((await bad.json()).error.message, /exactly two websites/)

  const body = { task: 'Compare', businesses: [{ name: 'A', url: 'https://a.com' }, { name: 'B', url: 'https://b.com' }] }
  const remote = await handleCompare({ request: request('https://chaospilot.example/api/compare', body), env: { MOCK_MODE: 'true' } })
  assert.equal(remote.status, 503)
  assert.equal((await remote.json()).error.code, 'credentials_missing')
})

test('cancelling stops a comparison run', async () => {
  const controller = new AbortController()
  const slowFetch: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
  })
  const cancellable = new Request('http://localhost:8788/api/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'Compare', businesses: [{ name: 'A', url: 'https://a.com' }, { name: 'B', url: 'https://b.com' }] }),
    signal: controller.signal,
  })
  const response = await handleCompare({ request: cancellable, env: { MOCK_MODE: 'true' } }, { fetchImplementation: slowFetch })
  setTimeout(() => controller.abort(), 20)
  const last = (await readEvents(response)).at(-1)
  assert.equal(last?.type, 'error')
  if (last?.type === 'error') assert.equal(last.code, 'request_cancelled')
})

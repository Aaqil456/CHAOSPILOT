import assert from 'node:assert/strict'
import test from 'node:test'
import { auditStreamEventSchema, type AuditStreamEvent } from './auditSchema.ts'
import { AuditRunState, createAuditTools } from './auditTools.ts'
import { handleAudit } from './auditHandler.ts'
import { runAgent, type AgentModel } from './runtime.ts'

const homepage = `<!doctype html><html lang="en"><head><title>Kopi Corner</title></head>
  <body><h1>Coffee</h1><img src="a.jpg"><a href="/contact">Contact</a><a href="/about/">About</a><a href="/team">Team</a><p>Fresh coffee in town every single morning.</p></body></html>`

const siteFetch: typeof fetch = async (input) => {
  const url = String(input)
  if (url.startsWith('https://broken-site.com')) return new Response('down', { status: 500 })
  return new Response(url.endsWith('/contact') ? '<title>Contact</title><a href="tel:+601">Call</a>' : homepage, {
    headers: { 'content-type': 'text/html' },
  })
}

const businesses = [
  { id: 'b1', name: 'Kopi Corner', url: 'https://kopicorner.com/' },
  { id: 'b2', name: 'Broken Bakery', url: 'https://broken-site.com/' },
]

function toolMap(state: AuditRunState) {
  return new Map(createAuditTools({ state, fetchImplementation: siteFetch }).map((tool) => [tool.name, tool]))
}

const context = { businesses }

const validProposal = {
  business_id: 'b1',
  summary: 'The homepage loads but lacks a description and clear actions.',
  findings: [{ title: 'Missing meta description', evidence: 'metaDescription: null', recommendation: 'Add one.', impact: 'high' }],
  email_subject: 'Ideas for Kopi Corner',
  email_body: 'Hi Kopi Corner team, we reviewed your homepage and found a few quick wins worth discussing.',
}

test('inspect_website fetches the submitted URL and records evidence', async () => {
  const state = new AuditRunState(businesses)
  const result = await toolMap(state).get('inspect_website')!.execute({ business_id: 'b1' }, context) as {
    evidence: { title: string; images: { missingAlt: number } }
  }
  assert.equal(result.evidence.title, 'Kopi Corner')
  assert.equal(result.evidence.images.missingAlt, 1)
  assert.equal(state.inspectionSummaries()[0].status, 'inspected')
})

test('inspect_website records failures and refuses unknown business ids', async () => {
  const state = new AuditRunState(businesses)
  const tools = toolMap(state)
  await assert.rejects(tools.get('inspect_website')!.execute({ business_id: 'b2' }, context), /HTTP 500.*Do not invent/)
  assert.equal(state.inspectionSummaries()[1].status, 'failed')
  await assert.rejects(tools.get('inspect_website')!.execute({ business_id: 'b9' }, context), /Unknown business_id/)
})

test('inspect_page only allows linked same-site paths within the per-business limit', async () => {
  const state = new AuditRunState(businesses)
  const tools = toolMap(state)
  const inspectPage = tools.get('inspect_page')!
  await assert.rejects(inspectPage.execute({ business_id: 'b1', path: '/contact' }, context), /inspect_website first/)
  await tools.get('inspect_website')!.execute({ business_id: 'b1' }, context)
  for (const path of ['//evil.com/x', 'https://evil.com', '/\\evil.com']) {
    await assert.rejects(inspectPage.execute({ business_id: 'b1', path }, context), /same-site/)
  }
  await assert.rejects(inspectPage.execute({ business_id: 'b1', path: '/services' }, context), /Only linked pages.*\/contact, \/about, \/team/)
  const contact = await inspectPage.execute({ business_id: 'b1', path: '/contact' }, context) as { page: { contact: { phone: boolean } } }
  assert.equal(contact.page.contact.phone, true)
  await inspectPage.execute({ business_id: 'b1', path: '/about' }, context)
  await assert.rejects(inspectPage.execute({ business_id: 'b1', path: '/team' }, context), /limit/)
})

test('save_proposal requires a successful inspection', async () => {
  const state = new AuditRunState(businesses)
  const tools = toolMap(state)
  await assert.rejects(tools.get('save_proposal')!.execute(validProposal, context), /no successful inspection/)
  await tools.get('inspect_website')!.execute({ business_id: 'b1' }, context)
  await tools.get('save_proposal')!.execute(validProposal, context)
  assert.equal(state.proposals.get('b1')?.emailSubject, 'Ideas for Kopi Corner')
})

test('invalid proposal arguments are rejected with field-level issues the model can fix', async () => {
  const state = new AuditRunState(businesses)
  let call = 0
  const model: AgentModel = {
    async decide(input) {
      call += 1
      if (call === 1) return { type: 'tool_calls', toolCalls: [{ id: 'i', name: 'inspect_website', arguments: { business_id: 'b1' } }] }
      if (call === 2) {
        return { type: 'tool_calls', toolCalls: [{ id: 's', name: 'save_proposal', arguments: { ...validProposal, findings: [{ ...validProposal.findings[0], impact: 'urgent' }] } }] }
      }
      const last = input.messages.at(-1)
      return { type: 'final', content: last?.role === 'tool' ? last.content : '' }
    },
  }
  const result = await runAgent({
    task: 'Audit',
    businesses,
    model,
    tools: createAuditTools({ state, fetchImplementation: siteFetch }),
    instructions: 'Test',
  })
  assert.equal(result.trace[1].status, 'error')
  assert.match(result.answer, /findings\.0\.impact/)
  assert.equal(state.proposals.size, 0)
})

async function readEvents(response: Response): Promise<AuditStreamEvent[]> {
  const text = await response.text()
  return text.trim().split('\n').map((line) => auditStreamEventSchema.parse(JSON.parse(line)))
}

function auditRequest(url: string, body: unknown): Request {
  return new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

test('audit route validates businesses and URLs before running', async () => {
  const unsafe = await handleAudit({
    request: auditRequest('https://chaospilot.test/api/audit', { task: 'Audit', businesses: [{ name: 'X', url: 'http://127.0.0.1/' }] }),
    env: {},
  })
  assert.equal(unsafe.status, 400)
  assert.match((await unsafe.json()).error.message, /businesses\.0\.url/)

  const tooMany = await handleAudit({
    request: auditRequest('https://chaospilot.test/api/audit', {
      task: 'Audit',
      businesses: Array.from({ length: 4 }, (_, index) => ({ name: `B${index}`, url: `https://b${index}.com` })),
    }),
    env: {},
  })
  assert.equal(tooMany.status, 400)

  const noKey = await handleAudit({
    request: auditRequest('https://chaospilot.test/api/audit', { task: 'Audit', businesses: [{ name: 'Kopi', url: 'https://kopicorner.com' }] }),
    env: { MOCK_MODE: 'true' },
  })
  assert.equal(noKey.status, 503)
  assert.equal((await noKey.json()).error.code, 'credentials_missing')
})

test('local mock audit streams real tool steps and evidence-based proposals', async () => {
  const response = await handleAudit({
    request: auditRequest('http://localhost:8788/api/audit', {
      task: 'Find improvements',
      businesses: [
        { name: 'Kopi Corner', url: 'https://kopicorner.com' },
        { name: 'Broken Bakery', url: 'https://broken-site.com' },
      ],
    }),
    env: { MOCK_MODE: 'true' },
  }, { fetchImplementation: siteFetch })
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /ndjson/)

  const events = await readEvents(response)
  assert.equal(events[0].type, 'run_started')
  assert.ok(events.some((event) => event.type === 'tool_started' && event.name === 'inspect_website'))
  const finished = events.flatMap((event) => event.type === 'tool_finished' ? [event.step] : [])
  assert.deepEqual(finished.map((step) => `${step.name}:${step.status}`), [
    'inspect_website:completed',
    'inspect_website:error',
    'save_proposal:completed',
  ])

  const result = events.at(-1)
  assert.equal(result?.type, 'result')
  if (result?.type !== 'result') return
  assert.equal(result.proposals.length, 1)
  assert.equal(result.proposals[0].businessId, 'b1')
  assert.match(result.proposals[0].emailBody, /MOCK/)
  assert.ok(result.proposals[0].findings.some((finding) => finding.evidence === 'metaDescription: null'))
  assert.deepEqual(result.inspections.map((inspection) => inspection.status), ['inspected', 'failed'])
  assert.ok(result.warnings.some((warning) => /Broken Bakery could not be inspected/.test(warning)))
  assert.match(result.answer, /\[MOCK\] Inspected 1 of 2 website/)
})

test('cancelling the request stops the run and reports cancellation', async () => {
  const controller = new AbortController()
  const slowFetch: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
  })
  const request = new Request('http://localhost:8788/api/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'Audit', businesses: [{ name: 'Kopi', url: 'https://kopicorner.com' }] }),
    signal: controller.signal,
  })
  const response = await handleAudit({ request, env: { MOCK_MODE: 'true' } }, { fetchImplementation: slowFetch })
  setTimeout(() => controller.abort(), 20)
  const events = await readEvents(response)
  const last = events.at(-1)
  assert.equal(last?.type, 'error')
  if (last?.type === 'error') assert.equal(last.code, 'request_cancelled')
})

test('save_proposal accepts findings sent as a JSON string, then validates strictly', async () => {
  const state = new AuditRunState(businesses)
  const tools = createAuditTools({ state, fetchImplementation: siteFetch })
  let call = 0
  const model: AgentModel = {
    async decide() {
      call += 1
      if (call === 1) return { type: 'tool_calls', toolCalls: [{ id: 'i', name: 'inspect_website', arguments: { business_id: 'b1' } }] }
      if (call === 2) {
        return { type: 'tool_calls', toolCalls: [{ id: 's', name: 'save_proposal', arguments: { ...validProposal, findings: JSON.stringify(validProposal.findings) } }] }
      }
      if (call === 3) {
        return { type: 'tool_calls', toolCalls: [{ id: 'bad', name: 'save_proposal', arguments: { ...validProposal, findings: '[not json' } }] }
      }
      return { type: 'final', content: 'done' }
    },
  }
  const result = await runAgent({ task: 'Audit', businesses, model, tools, instructions: 'Test' })
  assert.deepEqual(result.trace.map((step) => step.status), ['completed', 'completed', 'error'])
  assert.equal(state.proposals.get('b1')?.findings[0].evidence, 'metaDescription: null')
})

test('audit run reminds the model to save a proposal it only wrote as text', async () => {
  const state = new AuditRunState(businesses.slice(0, 1))
  let call = 0
  const reminders: string[] = []
  const model: AgentModel = {
    async decide(input) {
      call += 1
      const last = input.messages.at(-1)
      if (last?.role === 'user' && call > 1) reminders.push(last.content)
      if (call === 1) return { type: 'tool_calls', toolCalls: [{ id: 'i', name: 'inspect_website', arguments: { business_id: 'b1' } }] }
      if (call === 2) return { type: 'final', content: 'Here is the proposal text… A proposal has been saved.' }
      if (call === 3) return { type: 'tool_calls', toolCalls: [{ id: 's', name: 'save_proposal', arguments: validProposal }] }
      return { type: 'final', content: 'Saved.' }
    },
  }
  const result = await runAgent({
    task: 'Audit',
    businesses: state.businesses,
    model,
    tools: createAuditTools({ state, fetchImplementation: siteFetch }),
    instructions: 'Test',
    reviewFinal: () => state.proposals.has('b1') ? null : 'Not finished: call save_proposal for Kopi Corner (b1).',
  })
  assert.equal(result.answer, 'Saved.')
  assert.equal(state.proposals.size, 1)
  assert.deepEqual(reminders, ['Not finished: call save_proposal for Kopi Corner (b1).'])
})

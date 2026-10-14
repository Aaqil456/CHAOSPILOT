import assert from 'node:assert/strict'
import test from 'node:test'
import { createNebiusModel } from './nebiusModel.ts'
import { runAgent } from './runtime.ts'
import type { AgentModelInput } from './runtime.ts'
import { z } from 'zod'

const modelInput: AgentModelInput = {
  task: 'Inspect this site and suggest improvements.',
  businesses: [{ id: 'biz-1', name: 'Example', url: 'https://example.com' }],
  messages: [{
    role: 'user',
    content: 'Inspect this site and suggest improvements.',
  }],
  tools: [{
    name: 'inspect_website',
    description: 'Return mock-only inspection data.',
    parameters: {
      type: 'object',
      properties: { businessId: { type: 'string' } },
      required: ['businessId'],
      additionalProperties: false,
    },
  }],
  instructions: 'Be accurate.',
  availableSkills: [{ name: 'website-inspection', description: 'Guide inspection.' }],
  activeSkills: [],
}

function completion(message: Record<string, unknown>): Response {
  return Response.json({ choices: [{ message }] })
}

test('sends server-side credentials, registered tools, and skill activation as a model request', async () => {
  let requestUrl = ''
  let requestHeaders: HeadersInit | undefined
  let requestBody: Record<string, unknown> | undefined

  const model = createNebiusModel({
    apiKey: 'test-secret',
    model: 'test-model',
    maxTokens: 512,
    fetchImplementation: async (input, init) => {
      requestUrl = String(input)
      requestHeaders = init?.headers
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return completion({ content: 'I will inspect the supplied business.' })
    },
  })

  const decision = await model.decide(modelInput)
  assert.equal(decision.type, 'final')
  assert.equal(requestUrl, 'https://api.tokenfactory.nebius.com/v1/chat/completions')
  assert.equal(new Headers(requestHeaders).get('Authorization'), 'Bearer test-secret')
  assert.equal(requestBody?.model, 'test-model')
  assert.equal(requestBody?.max_tokens, 512)

  const tools = requestBody?.tools as Array<{ function: { name: string } }>
  assert.deepEqual(tools.map((tool) => tool.function.name), ['inspect_website', 'activate_skills'])
  assert.deepEqual(requestBody?.messages instanceof Array, true)
  assert.match(JSON.stringify(requestBody?.messages), /https:\/\/example\.com/)
  assert.doesNotMatch(JSON.stringify(requestBody?.messages), /test-secret/)
})

test('converts a model function call to a validated runtime tool decision', async () => {
  const model = createNebiusModel({
    apiKey: 'test-secret',
    model: 'test-model',
    maxTokens: 512,
    fetchImplementation: async () => completion({
      content: null,
      tool_calls: [{
        id: 'call-inspect-1',
        type: 'function',
        function: {
          name: 'inspect_website',
          arguments: '{"businessId":"biz-1"}',
        },
      }],
    }),
  })

  assert.deepEqual(await model.decide(modelInput), {
    type: 'tool_calls',
    toolCalls: [{
      id: 'call-inspect-1',
      name: 'inspect_website',
      arguments: { businessId: 'biz-1' },
    }],
  })
})

test('passes real tool output back in the next mocked Nebius model request', async () => {
  const sentBodies: Array<Record<string, unknown>> = []
  const model = createNebiusModel({
    apiKey: 'test-secret',
    model: 'test-model',
    maxTokens: 512,
    fetchImplementation: async (_input, init) => {
      sentBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      if (sentBodies.length === 1) {
        return completion({
          content: null,
          tool_calls: [{
            id: 'call-1',
            type: 'function',
            function: {
              name: 'lookup',
              arguments: '{"query":"actual result"}',
            },
          }],
        })
      }
      return completion({ content: 'I used the returned tool result.' })
    },
  })

  const result = await runAgent({
    task: modelInput.task,
    businesses: modelInput.businesses,
    instructions: modelInput.instructions,
    model,
    tools: [{
      name: 'lookup',
      description: 'Return a fixed test fixture.',
      inputSchema: z.object({ query: z.string() }).strict(),
      async execute(input) {
        const parsed = z.object({ query: z.string() }).strict().parse(input)
        return { evidence: `Result for ${parsed.query}` }
      },
    }],
  })

  assert.equal(result.answer, 'I used the returned tool result.')
  assert.equal(result.trace.length, 1)
  assert.equal(sentBodies.length, 2)
  const nextMessages = sentBodies[1]?.messages as Array<Record<string, unknown>>
  assert.ok(nextMessages.some((message) =>
    message.role === 'tool'
    && message.tool_call_id === 'call-1'
    && message.content === '{"evidence":"Result for actual result"}',
  ))
})

test('converts skill selection into runtime skill activation, not executable tool invocation', async () => {
  const model = createNebiusModel({
    apiKey: 'test-secret',
    model: 'test-model',
    maxTokens: 512,
    fetchImplementation: async () => completion({
      content: null,
      tool_calls: [{
        id: 'call-skills-1',
        type: 'function',
        function: {
          name: 'activate_skills',
          arguments: '{"skill_names":["website-inspection"]}',
        },
      }],
    }),
  })

  assert.deepEqual(await model.decide(modelInput), {
    type: 'activate_skills',
    skillNames: ['website-inspection'],
  })
})

test('rejects malformed provider responses without a success-shaped fallback', async () => {
  const model = createNebiusModel({
    apiKey: 'test-secret',
    model: 'test-model',
    maxTokens: 512,
    fetchImplementation: async () => Response.json({ choices: [] }),
  })

  await assert.rejects(model.decide(modelInput), /unexpected response format/)
})

test('reports upstream tool-calling errors without exposing response bodies', async () => {
  const model = createNebiusModel({
    apiKey: 'test-secret',
    model: 'test-model',
    maxTokens: 512,
    fetchImplementation: async () => new Response('sensitive upstream detail', { status: 400 }),
  })

  await assert.rejects(model.decide(modelInput), (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.match(error.message, /HTTP 400/)
    assert.doesNotMatch(error.message, /sensitive upstream detail|test-secret/)
    return true
  })
})

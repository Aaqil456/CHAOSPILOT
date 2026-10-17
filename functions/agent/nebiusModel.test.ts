import assert from 'node:assert/strict'
import test from 'node:test'
import { createNebiusModel } from './nebiusModel.ts'
import { runAgent } from './runtime.ts'
import type { AgentModelInput } from './runtime.ts'
import { ProjectWorkspace } from './projectFiles.ts'
import { z } from 'zod'

const modelInput: AgentModelInput = {
  task: 'Create a small website.',
  businesses: [],
  messages: [{
    role: 'user',
    content: 'Create a small website.',
  }],
  tools: [{
    name: 'list_files',
    description: 'List project files.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  }, {
    name: 'write_file',
    description: 'Create a project file.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
      additionalProperties: false,
    },
  }],
  instructions: 'Be accurate.',
  availableSkills: [],
  activeSkills: [],
}

function completion(message: Record<string, unknown>): Response {
  return Response.json({ choices: [{ message }] })
}

test('sends server-side credentials and registered project tools as a model request', async () => {
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
      return completion({ content: 'I will create the supplied project.' })
    },
  })

  const decision = await model.decide(modelInput)
  assert.equal(decision.type, 'final')
  assert.equal(requestUrl, 'https://api.tokenfactory.nebius.com/v1/chat/completions')
  assert.equal(new Headers(requestHeaders).get('Authorization'), 'Bearer test-secret')
  assert.equal(requestBody?.model, 'test-model')
  assert.equal(requestBody?.max_tokens, 512)

  const tools = requestBody?.tools as Array<{ function: { name: string } }>
  assert.deepEqual(tools.map((tool) => tool.function.name), ['list_files', 'write_file'])
  assert.deepEqual(requestBody?.messages instanceof Array, true)
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
        id: 'call-list-1',
        type: 'function',
        function: {
          name: 'list_files',
          arguments: '{}',
        },
      }],
    }),
  })

  assert.deepEqual(await model.decide(modelInput), {
    type: 'tool_calls',
    toolCalls: [{
      id: 'call-list-1',
      name: 'list_files',
      arguments: {},
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
    workspace: new ProjectWorkspace({}),
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

test('rejects malformed provider responses without a success-shaped fallback', async () => {
  const model = createNebiusModel({
    apiKey: 'test-secret',
    model: 'test-model',
    maxTokens: 512,
    fetchImplementation: async () => Response.json({
      id: 'response-id',
      choices: [{ message: { content: 'private response text', tool_calls: 'not-a-list' } }],
    }),
  })

  await assert.rejects(model.decide(modelInput), (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.match(error.message, /unexpected Chat Completions response format/)
    assert.match(error.message, /response fields: id, choices/)
    assert.match(error.message, /message fields: content, tool_calls/)
    assert.doesNotMatch(error.message, /private response text|response-id/)
    return true
  })
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

test('treats tool_calls: null with text content as a final answer (Nebius response shape)', async () => {
  const model = createNebiusModel({
    apiKey: 'server-key',
    model: 'nvidia/test-model',
    maxTokens: 600,
    fetchImplementation: async () => completion({
      role: 'assistant',
      content: 'All proposals are saved.',
      tool_calls: null,
      function_call: null,
      reasoning: 'internal reasoning text',
    }),
  })
  assert.deepEqual(await model.decide(modelInput), { type: 'final', content: 'All proposals are saved.' })
})

test('reports truncated model output instead of treating it as a final answer', async () => {
  const model = createNebiusModel({
    apiKey: 'server-key',
    model: 'nvidia/test-model',
    maxTokens: 600,
    fetchImplementation: async () => Response.json({
      choices: [{ finish_reason: 'length', message: { role: 'assistant', content: '<tool_call>\n<function=save_proposal>…', tool_calls: null } }],
    }),
  })
  await assert.rejects(model.decide(modelInput), (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.equal((error as { code?: string }).code, 'output_truncated')
    assert.match(error.message, /600 tokens/)
    return true
  })
})

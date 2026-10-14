import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod'
import {
  runAgent,
  type AgentModel,
  type AgentTool,
  type AgentSkill,
} from './runtime.ts'
import { mockModel } from './mockModel.ts'
import { inspectWebsiteTool } from './tools.ts'

const countTool: AgentTool = {
  name: 'count',
  description: 'Return the validated count input.',
  inputSchema: z.object({ value: z.number().int() }).strict(),
  async execute(input) {
    return input
  },
}

const baseOptions = {
  task: 'Do a small task.',
  businesses: [],
  instructions: 'Test instructions.',
  tools: [countTool],
}

test('returns the model final answer without inventing tool calls', async () => {
  const result = await runAgent({
    ...baseOptions,
    model: {
      async decide() {
        return { type: 'final', content: 'Done without tools.' }
      },
    },
  })

  assert.equal(result.answer, 'Done without tools.')
  assert.equal(result.trace.length, 0)
  assert.equal(result.turns, 1)
})

test('returns actual tool output to the model before its next decision', async () => {
  const seenMessages: string[] = []
  const model: AgentModel = {
    async decide(input) {
      const toolResult = input.messages.find((message) => message.role === 'tool')
      if (!toolResult) {
        return {
          type: 'tool_calls',
          toolCalls: [{ id: 'call-1', name: 'count', arguments: { value: 7 } }],
        }
      }
      seenMessages.push(toolResult.content)
      return { type: 'final', content: `Received: ${toolResult.content}` }
    },
  }

  const result = await runAgent({ ...baseOptions, model })
  assert.equal(seenMessages.length, 1)
  assert.equal(seenMessages[0], '{"value":7}')
  assert.equal(result.answer, 'Received: {"value":7}')
  assert.equal(result.trace[0]?.status, 'completed')
})

test('allows the model to make multiple iterative calls without a fixed action sequence', async () => {
  let decisionCount = 0
  const model: AgentModel = {
    async decide(input) {
      decisionCount += 1
      const results = input.messages.filter((message) => message.role === 'tool')
      if (results.length < 2) {
        return {
          type: 'tool_calls',
          toolCalls: [{
            id: `call-${results.length + 1}`,
            name: 'count',
            arguments: { value: results.length + 1 },
          }],
        }
      }
      return { type: 'final', content: 'Both model-selected calls returned.' }
    },
  }

  const result = await runAgent({ ...baseOptions, model })
  assert.equal(decisionCount, 3)
  assert.deepEqual(result.trace.map((entry) => entry.input), [{ value: 1 }, { value: 2 }])
  assert.equal(result.answer, 'Both model-selected calls returned.')
})

test('records unavailable tool calls and returns the error to the model', async () => {
  let receivedToolError = false
  const model: AgentModel = {
    async decide(input) {
      const toolResult = input.messages.find((message) => message.role === 'tool')
      if (toolResult) {
        receivedToolError = toolResult.content.includes('not available')
        return { type: 'final', content: 'Stopped after the unavailable tool.' }
      }
      return {
        type: 'tool_calls',
        toolCalls: [{ id: 'missing-1', name: 'not_registered', arguments: {} }],
      }
    },
  }

  const result = await runAgent({ ...baseOptions, model })
  assert.equal(receivedToolError, true)
  assert.equal(result.trace[0]?.status, 'error')
})

test('rejects invalid arguments without executing the tool', async () => {
  let executed = false
  const tool: AgentTool = {
    ...countTool,
    async execute(input) {
      executed = true
      return input
    },
  }
  const model: AgentModel = {
    async decide(input) {
      if (input.messages.some((message) => message.role === 'tool')) {
        return { type: 'final', content: 'Invalid call was rejected.' }
      }
      return {
        type: 'tool_calls',
        toolCalls: [{ id: 'bad-args', name: 'count', arguments: { value: 'not-a-number' } }],
      }
    },
  }

  const result = await runAgent({ ...baseOptions, tools: [tool], model })
  assert.equal(executed, false)
  assert.equal(result.trace[0]?.status, 'error')
  assert.match(result.trace[0]?.output ?? '', /failed validation/)
})

test('returns tool execution failures to the model and records the error', async () => {
  const tool: AgentTool = {
    ...countTool,
    async execute() {
      throw new Error('fixture tool failure')
    },
  }
  const model: AgentModel = {
    async decide(input) {
      const toolResult = input.messages.find((message) => message.role === 'tool')
      if (toolResult) {
        assert.match(toolResult.content, /fixture tool failure/)
        return { type: 'final', content: 'Tool failure received.' }
      }
      return {
        type: 'tool_calls',
        toolCalls: [{ id: 'failed-call', name: 'count', arguments: { value: 1 } }],
      }
    },
  }

  const result = await runAgent({ ...baseOptions, tools: [tool], model })
  assert.equal(result.trace[0]?.status, 'error')
})

test('stops before exceeding the configured tool-call limit', async () => {
  const result = await runAgent({
    ...baseOptions,
    maxToolCalls: 1,
    model: {
      async decide() {
        return {
          type: 'tool_calls',
          toolCalls: [
            { id: 'one', name: 'count', arguments: { value: 1 } },
            { id: 'two', name: 'count', arguments: { value: 2 } },
          ],
        }
      },
    },
  })

  assert.equal(result.stopReason, 'tool_call_limit')
  assert.equal(result.trace.length, 1)
})

test('stops after the configured model-turn limit', async () => {
  let calls = 0
  const result = await runAgent({
    ...baseOptions,
    maxTurns: 2,
    model: {
      async decide() {
        calls += 1
        return { type: 'tool_calls', toolCalls: [] }
      },
    },
  })

  assert.equal(calls, 2)
  assert.equal(result.stopReason, 'turn_limit')
})

test('loads only registered skills requested by the model and supplies their content next turn', async () => {
  const skill: AgentSkill = {
    name: 'website-analysis',
    description: 'Analyze evidence against the task.',
    content: 'Prioritize evidence that matches the objective.',
  }
  let secondTurnSkillText: string | undefined
  let secondTurnAvailableNames: string[] = []

  const result = await runAgent({
    ...baseOptions,
    skills: [skill],
    model: {
      async decide(input) {
        if (input.activeSkills.length === 0) {
          assert.deepEqual(input.availableSkills, [{
            name: skill.name,
            description: skill.description,
          }])
          return { type: 'activate_skills', skillNames: [skill.name, 'unregistered-skill'] }
        }

        secondTurnSkillText = input.activeSkills[0]?.content
        secondTurnAvailableNames = input.availableSkills.map((available) => available.name)
        return { type: 'final', content: 'Finished with the loaded guidance.' }
      },
    },
  })

  assert.equal(secondTurnSkillText, skill.content)
  assert.deepEqual(secondTurnAvailableNames, [skill.name])
  assert.deepEqual(result.activatedSkills, [skill.name])
})

test('mock selector requests only skills matching the supplied task and available registry', async () => {
  const input = {
    task: 'Compare these competitors and draft landing page copy.',
    businesses: [],
    messages: [{ role: 'user' as const, content: 'Compare these competitors and draft landing page copy.' }],
    tools: [],
    instructions: 'Mock agent instructions.',
    availableSkills: [
      { name: 'competitor-research', description: 'Compare supplied competitors.' },
      { name: 'content-generation', description: 'Draft requested content.' },
      { name: 'website-analysis', description: 'Analyze website evidence.' },
    ],
    activeSkills: [],
  }

  const decision = await mockModel.decide(input)
  assert.deepEqual(decision, {
    type: 'activate_skills',
    skillNames: ['competitor-research', 'content-generation'],
  })
})

test('mock website inspection returns no real-world evidence and makes no fetch', async () => {
  const result = await inspectWebsiteTool.execute(
    { businessId: 'business-1' },
    { businesses: [{ id: 'business-1', name: 'Example Co', url: 'https://example.com' }] },
  )

  assert.deepEqual(result, {
    mode: 'mock',
    inspected: false,
    businessId: 'business-1',
    businessName: 'Example Co',
    submittedUrl: 'https://example.com',
    evidence: [],
    message: 'Mock result only. No website request was made and no page evidence is available.',
  })
})

test('mock website task activates a skill, sees the mock tool result, then returns an honest limitation', async () => {
  const result = await runAgent({
    ...baseOptions,
    task: 'Inspect this website and tell me what it says.',
    businesses: [{ id: 'business-1', name: 'Example Co', url: 'https://example.com' }],
    tools: [inspectWebsiteTool],
    skills: [{
      name: 'website-inspection',
      description: 'Inspect supplied website evidence.',
      content: 'Use only actual page evidence.',
    }],
    model: mockModel,
  })

  assert.deepEqual(result.activatedSkills, ['website-inspection'])
  assert.equal(result.trace.length, 1)
  assert.equal(result.trace[0]?.name, 'inspect_website')
  assert.equal(result.trace[0]?.status, 'completed')
  assert.match(result.trace[0]?.output ?? '', /"evidence":\[\]/)
  assert.match(result.answer, /no page evidence/)
})

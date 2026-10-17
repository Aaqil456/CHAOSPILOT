import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod'
import {
  runAgent,
  type AgentModel,
  type AgentTool,
  type AgentSkill,
} from './runtime.ts'

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

test('reviewFinal sends a bounded reminder instead of finishing early', async () => {
  let decisions = 0
  const seen: string[] = []
  const result = await runAgent({
    ...baseOptions,
    model: {
      async decide(input) {
        decisions += 1
        const last = input.messages.at(-1)
        if (last?.role === 'user') seen.push(last.content)
        return { type: 'final', content: `answer ${decisions}` }
      },
    },
    reviewFinal: () => 'Please save the result first.',
    maxFinalReminders: 2,
  })
  assert.equal(decisions, 3)
  assert.equal(result.answer, 'answer 3')
  assert.deepEqual(seen.slice(1), ['Please save the result first.', 'Please save the result first.'])
})

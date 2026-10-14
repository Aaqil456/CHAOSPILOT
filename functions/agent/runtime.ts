import { z } from 'zod'

export type AgentMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: AgentToolCall[] }
  | { role: 'tool'; content: string; toolCallId: string; toolName: string }

export type AgentToolCall = {
  id: string
  name: string
  arguments: unknown
}

export type AgentToolTrace = {
  id: string
  name: string
  input: unknown
  output: string
  status: 'completed' | 'error'
}

export type AgentToolContext = {
  businesses: Array<{ id: string; name: string; url: string }>
}

export type AgentTool = {
  name: string
  description: string
  inputSchema: z.ZodType
  execute: (input: unknown, context: AgentToolContext) => Promise<unknown>
}

export type AgentModelTool = {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type AgentDecision =
  | { type: 'final'; content: string }
  | { type: 'activate_skills'; skillNames: string[] }
  | { type: 'tool_calls'; content?: string; toolCalls: AgentToolCall[] }

export type AgentSkill = {
  name: string
  description: string
  content: string
}

export type AgentModelInput = {
  task: string
  businesses: AgentToolContext['businesses']
  messages: AgentMessage[]
  tools: AgentModelTool[]
  instructions: string
  availableSkills: Array<Pick<AgentSkill, 'name' | 'description'>>
  activeSkills: AgentSkill[]
}

export type AgentModel = {
  decide: (input: AgentModelInput) => Promise<AgentDecision>
}

export type AgentRunResult = {
  answer: string
  trace: AgentToolTrace[]
  activatedSkills: string[]
  turns: number
  stopReason: 'final' | 'turn_limit' | 'tool_call_limit'
}

export type RunAgentOptions = {
  task: string
  businesses: AgentToolContext['businesses']
  model: AgentModel
  tools: AgentTool[]
  instructions: string
  skills?: AgentSkill[]
  maxTurns?: number
  maxToolCalls?: number
}

const defaultMaxTurns = 8
const defaultMaxToolCalls = 6
const toolResultLimit = 8_000

function serialize(value: unknown): string {
  const encoded = JSON.stringify(value) ?? 'null'
  return encoded.length > toolResultLimit
    ? `${encoded.slice(0, toolResultLimit)}… [truncated]`
    : encoded
}

export async function runAgent(options: RunAgentOptions): Promise<AgentRunResult> {
  const maxTurns = options.maxTurns ?? defaultMaxTurns
  const maxToolCalls = options.maxToolCalls ?? defaultMaxToolCalls
  const tools = new Map(options.tools.map((tool) => [tool.name, tool]))
  if (tools.size !== options.tools.length) {
    throw new Error('Agent tool names must be unique.')
  }
  const modelTools = options.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: z.toJSONSchema(tool.inputSchema) as Record<string, unknown>,
  }))
  const messages: AgentMessage[] = [{ role: 'user', content: options.task }]
  const trace: AgentToolTrace[] = []
  const skillCatalog = new Map((options.skills ?? []).map((skill) => [skill.name, skill]))
  if (skillCatalog.size !== (options.skills ?? []).length) {
    throw new Error('Agent skill names must be unique.')
  }
  const activeSkills = new Map<string, AgentSkill>()

  for (let turn = 1; turn <= maxTurns; turn += 1) {
    const decision = await options.model.decide({
      task: options.task,
      businesses: options.businesses,
      messages: [...messages],
      tools: modelTools,
      instructions: options.instructions,
      availableSkills: [...skillCatalog.values()].map(({ name, description }) => ({ name, description })),
      activeSkills: [...activeSkills.values()],
    })

    if (decision.type === 'final') {
      messages.push({ role: 'assistant', content: decision.content })
      return {
        answer: decision.content,
        trace,
        activatedSkills: [...activeSkills.keys()],
        turns: turn,
        stopReason: 'final',
      }
    }

    if (decision.type === 'activate_skills') {
      const activatedNow: string[] = []
      const unavailable: string[] = []
      for (const name of decision.skillNames) {
        const skill = skillCatalog.get(name)
        if (!skill) {
          unavailable.push(name)
        } else if (!activeSkills.has(name)) {
          activeSkills.set(name, skill)
          activatedNow.push(name)
        }
      }

      messages.push({
        role: 'assistant',
        content: [
          activatedNow.length > 0 ? `Loaded skills: ${activatedNow.join(', ')}.` : '',
          unavailable.length > 0 ? `Unavailable skills not loaded: ${unavailable.join(', ')}.` : '',
          activatedNow.length === 0 && unavailable.length === 0
            ? 'No new skills were loaded; continue without repeating this request.'
            : '',
        ].filter(Boolean).join(' '),
      })
      continue
    }

    messages.push({
      role: 'assistant',
      content: decision.content ?? '',
      toolCalls: decision.toolCalls,
    })

    for (const call of decision.toolCalls) {
      if (trace.length >= maxToolCalls) {
        return {
          answer: 'The run stopped because it reached the tool-call limit.',
          trace,
          activatedSkills: [...activeSkills.keys()],
          turns: turn,
          stopReason: 'tool_call_limit',
        }
      }

      const tool = tools.get(call.name)
      let result: string
      let status: AgentToolTrace['status']

      if (!tool) {
        result = serialize({ error: `Tool "${call.name}" is not available.` })
        status = 'error'
      } else {
        const parsed = tool.inputSchema.safeParse(call.arguments)
        if (!parsed.success) {
          result = serialize({ error: 'Tool arguments failed validation.' })
          status = 'error'
        } else {
          try {
            result = serialize(await tool.execute(parsed.data, {
              businesses: options.businesses,
            }))
            status = 'completed'
          } catch (error) {
            result = serialize({
              error: error instanceof Error ? error.message : 'Tool execution failed.',
            })
            status = 'error'
          }
        }
      }

      trace.push({
        id: call.id,
        name: call.name,
        input: call.arguments,
        output: result,
        status,
      })
      messages.push({
        role: 'tool',
        content: result,
        toolCallId: call.id,
        toolName: call.name,
      })
    }
  }

  return {
    answer: 'The run stopped because it reached the model-turn limit.',
    trace,
    activatedSkills: [...activeSkills.keys()],
    turns: maxTurns,
    stopReason: 'turn_limit',
  }
}

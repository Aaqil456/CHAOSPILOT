import { z } from 'zod'
import type { ProjectWorkspace } from './projectFiles.ts'

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
  durationMs?: number
}

export type AgentEvent =
  | { type: 'model_turn'; turn: number }
  | { type: 'tool_started'; turn: number; id: string; name: string; input: unknown }
  | { type: 'tool_finished'; turn: number; step: AgentToolTrace }

export type AgentToolContext = {
  businesses: Array<{ id: string; name: string; url: string }>
  workspace: ProjectWorkspace
}

export type AgentTool = {
  name: string
  description: string
  inputSchema: z.ZodType
  /** Optional repair of known model formatting quirks, applied before validation. */
  prepareInput?: (input: unknown) => unknown
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
  workspace: ProjectWorkspace
  maxTurns?: number
  maxToolCalls?: number
  onEvent?: (event: AgentEvent) => void
  signal?: AbortSignal
  /**
   * Called when the model tries to finish. Returning a message sends it back to
   * the model as a reminder instead of finishing (bounded by maxFinalReminders).
   */
  reviewFinal?: () => string | null
  maxFinalReminders?: number
}

export class AgentCancelledError extends Error {
  constructor() {
    super('The agent run was cancelled.')
    this.name = 'AgentCancelledError'
  }
}

const defaultMaxTurns = 8
const defaultMaxToolCalls = 12
const toolResultLimit = 128 * 1024

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
  const maxFinalReminders = options.maxFinalReminders ?? 2
  let finalReminders = 0

  const emit = (event: AgentEvent) => {
    try {
      options.onEvent?.(event)
    } catch {
      // Observers must never break the run.
    }
  }
  const assertActive = () => {
    if (options.signal?.aborted) throw new AgentCancelledError()
  }

  for (let turn = 1; turn <= maxTurns; turn += 1) {
    assertActive()
    emit({ type: 'model_turn', turn })
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
      const reminder = finalReminders < maxFinalReminders ? options.reviewFinal?.() : null
      if (reminder) {
        finalReminders += 1
        messages.push({ role: 'user', content: reminder })
        continue
      }
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

      assertActive()
      emit({ type: 'tool_started', turn, id: call.id, name: call.name, input: call.arguments })
      const startedAt = Date.now()
      const tool = tools.get(call.name)
      let result: string
      let status: AgentToolTrace['status']

      if (!tool) {
        result = serialize({ error: `Tool "${call.name}" is not available.` })
        status = 'error'
      } else {
        const parsed = tool.inputSchema.safeParse(tool.prepareInput ? tool.prepareInput(call.arguments) : call.arguments)
        if (!parsed.success) {
          result = serialize({
            error: 'Tool arguments failed validation. Fix the listed fields and call the tool again.',
            issues: parsed.error.issues.slice(0, 6).map((issue) =>
              `${issue.path.join('.') || '(root)'}: ${issue.message}`.slice(0, 200)),
          })
          status = 'error'
        } else {
          try {
            result = serialize(await tool.execute(parsed.data, {
              businesses: options.businesses,
              workspace: options.workspace,
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

      const step: AgentToolTrace = {
        id: call.id,
        name: call.name,
        input: call.arguments,
        output: result,
        status,
        durationMs: Date.now() - startedAt,
      }
      trace.push(step)
      emit({ type: 'tool_finished', turn, step })
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

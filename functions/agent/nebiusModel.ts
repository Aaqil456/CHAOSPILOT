import { z } from 'zod'
import type {
  AgentDecision,
  AgentModel,
  AgentModelInput,
} from './runtime.ts'

const maxResponseBytes = 64 * 1024
const modelTimeoutMs = 30_000

const completionSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string().nullable().optional(),
      tool_calls: z.array(z.object({
        id: z.string().min(1),
        type: z.literal('function'),
        function: z.object({
          name: z.string().min(1),
          arguments: z.string(),
        }),
      })).optional(),
    }),
  })).min(1),
})

const activateSkillsSchema = z.object({
  skill_names: z.array(z.string().min(1)).min(1).max(8),
}).strict()

type NebiusModelOptions = {
  apiKey: string
  model: string
  maxTokens: number
  signal?: AbortSignal
  fetchImplementation?: typeof fetch
}

export class NebiusModelError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'NebiusModelError'
    this.status = status
    this.code = code
  }
}

async function readTextAtMost(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<string | null> {
  if (!body) return ''

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    byteLength += value.byteLength
    if (byteLength > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  return new TextDecoder().decode(bytes)
}

function toProviderMessages(input: AgentModelInput): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = [
    {
      role: 'system',
      content: [
        input.instructions,
        input.availableSkills.length > 0
          ? `Optional registered skills are available: ${input.availableSkills.map(({ name, description }) => `${name}: ${description}`).join('; ')}. If a skill is useful, request it with activate_skills before continuing. Skill activation loads instructions only; it is not an executable capability.`
          : '',
        'Use only the registered tools shown in this request. The runtime supplies actual tool results on later turns.',
      ].filter(Boolean).join('\n\n'),
    },
    ...input.activeSkills.map((skill) => ({
      role: 'system',
      content: `Active skill: ${skill.name}\n\n${skill.content}`,
    })),
  ]

  for (const message of input.messages) {
    if (message.role === 'user') {
      messages.push({ role: 'user', content: message.content })
    } else if (message.role === 'assistant') {
      messages.push({
        role: 'assistant',
        content: message.content || null,
        ...(message.toolCalls?.length
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: 'function',
                function: {
                  name: call.name,
                  arguments: JSON.stringify(call.arguments),
                },
              })),
            }
          : {}),
      })
    } else {
      messages.push({
        role: 'tool',
        tool_call_id: message.toolCallId,
        content: message.content,
      })
    }
  }

  return messages
}

function fieldNames(value: unknown): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return '(not an object)'
  const names = Object.keys(value)
    .filter((name) => /^[a-zA-Z0-9_.-]{1,40}$/.test(name))
    .slice(0, 8)
  return names.length > 0 ? names.join(', ') : '(none)'
}

function responseShape(value: unknown): string {
  const root = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
  const choices = root?.choices
  const firstChoice = Array.isArray(choices) ? choices[0] : undefined
  const choice = typeof firstChoice === 'object' && firstChoice !== null && !Array.isArray(firstChoice)
    ? firstChoice as Record<string, unknown>
    : undefined
  return [
    `response fields: ${fieldNames(value)}`,
    `first choice fields: ${fieldNames(firstChoice)}`,
    `message fields: ${fieldNames(choice?.message)}`,
  ].join('; ')
}

function createProviderTools(input: AgentModelInput): Array<Record<string, unknown>> {
  const tools = input.tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))

  if (input.availableSkills.length > 0) {
    tools.push({
      type: 'function',
      function: {
        name: 'activate_skills',
        description: 'Load relevant registered skill instructions for this task. This does not execute an external action.',
        parameters: {
          type: 'object',
          properties: {
            skill_names: {
              type: 'array',
              items: {
                type: 'string',
                enum: input.availableSkills.map((skill) => skill.name),
              },
              minItems: 1,
              maxItems: input.availableSkills.length,
            },
          },
          required: ['skill_names'],
          additionalProperties: false,
        },
      },
    })
  }

  return tools
}

function parseDecision(
  content: string | null | undefined,
  toolCalls: z.infer<typeof completionSchema>['choices'][number]['message']['tool_calls'],
): AgentDecision {
  if (!toolCalls?.length) {
    return { type: 'final', content: content ?? '' }
  }

  const activationCalls = toolCalls.filter((call) => call.function.name === 'activate_skills')
  if (activationCalls.length > 0) {
    if (activationCalls.length !== 1 || toolCalls.length !== 1) {
      throw new NebiusModelError(
        502,
        'invalid_tool_decision',
        'The model returned an invalid combination of skill and executable tool calls.',
      )
    }

    let argumentsValue: unknown
    try {
      argumentsValue = JSON.parse(activationCalls[0].function.arguments)
    } catch {
      throw new NebiusModelError(502, 'invalid_tool_arguments', 'The model returned invalid skill-selection arguments.')
    }
    const parsed = activateSkillsSchema.safeParse(argumentsValue)
    if (!parsed.success) {
      throw new NebiusModelError(502, 'invalid_tool_arguments', 'The model returned invalid skill-selection arguments.')
    }
    return { type: 'activate_skills', skillNames: parsed.data.skill_names }
  }

  const parsedCalls = toolCalls.map((call) => {
    let argumentsValue: unknown
    try {
      argumentsValue = JSON.parse(call.function.arguments)
    } catch {
      throw new NebiusModelError(502, 'invalid_tool_arguments', 'The model returned invalid tool-call arguments.')
    }

    return {
      id: call.id,
      name: call.function.name,
      arguments: argumentsValue,
    }
  })

  return {
    type: 'tool_calls',
    ...(content === null || content === undefined ? {} : { content }),
    toolCalls: parsedCalls,
  }
}

export function createNebiusModel(options: NebiusModelOptions): AgentModel {
  const fetchImplementation = options.fetchImplementation ?? fetch

  return {
    async decide(input) {
      const tools = createProviderTools(input)
      const signals: AbortSignal[] = [AbortSignal.timeout(modelTimeoutMs)]
      if (options.signal) signals.push(options.signal)

      let response: Response
      try {
        response = await fetchImplementation('https://api.tokenfactory.nebius.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: options.model,
            messages: toProviderMessages(input),
            ...(tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
            max_tokens: options.maxTokens,
          }),
          signal: AbortSignal.any(signals),
        })
      } catch (error) {
        if (error instanceof Error && error.name === 'TimeoutError') {
          throw new NebiusModelError(504, 'upstream_timeout', 'The model request timed out.')
        }
        if (options.signal?.aborted) {
          throw new NebiusModelError(499, 'request_cancelled', 'The agent run was cancelled.')
        }
        throw new NebiusModelError(502, 'upstream_unavailable', 'Could not reach Nebius Token Factory.')
      }

      if (!response.ok) {
        throw new NebiusModelError(
          502,
          'upstream_error',
          `Nebius Token Factory returned HTTP ${response.status}. Check the configured model and tool-calling support.`,
        )
      }

      const responseText = await readTextAtMost(response.body, maxResponseBytes)
      if (responseText === null) {
        throw new NebiusModelError(502, 'upstream_response_too_large', 'Nebius returned an oversized response.')
      }

      let responseBody: unknown
      try {
        responseBody = JSON.parse(responseText)
      } catch {
        throw new NebiusModelError(502, 'invalid_upstream_response', 'Nebius returned invalid JSON.')
      }

      const completion = completionSchema.safeParse(responseBody)
      if (!completion.success) {
        throw new NebiusModelError(
          502,
          'invalid_upstream_response',
          `Nebius returned an unexpected Chat Completions response format (${responseShape(responseBody)}).`,
        )
      }

      const message = completion.data.choices[0].message
      return parseDecision(message.content, message.tool_calls)
    },
  }
}

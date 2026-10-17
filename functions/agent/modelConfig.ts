import { createNebiusModel } from './nebiusModel.ts'
import type { AgentModel } from './runtime.ts'

export interface ModelEnv {
  MOCK_MODE?: string
  NEBIUS_API_KEY?: string
  NEBIUS_MAX_TOKENS?: string
  NEBIUS_AUDIT_MAX_TOKENS?: string
  NEBIUS_MODEL?: string
}

export const maxAllowedTokens = 4096

export type ModelSelection =
  | { ok: true; model: AgentModel; modelName: string; mode: 'live' | 'mock' }
  | { ok: false; status: number; code: string; message: string }

export function isLocalRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)
}

/** Picks the live Nebius model, or the local mock only on localhost with MOCK_MODE=true. */
export function selectModel(options: {
  env: ModelEnv
  request: Request
  mockModel: AgentModel
  defaultMaxTokens: number
  /** Environment variable that overrides defaultMaxTokens for this endpoint. */
  maxTokensVariable?: 'NEBIUS_MAX_TOKENS' | 'NEBIUS_AUDIT_MAX_TOKENS'
  signal?: AbortSignal
}): ModelSelection {
  const { env, request } = options
  if (env.MOCK_MODE === 'true' && isLocalRequest(request)) {
    return { ok: true, model: options.mockModel, modelName: 'local-deterministic-mock', mode: 'mock' }
  }

  const maxTokensVariable = options.maxTokensVariable ?? 'NEBIUS_MAX_TOKENS'
  const configuredMaxTokens = env[maxTokensVariable]?.trim()
  const maxTokens = configuredMaxTokens ? Number(configuredMaxTokens) : options.defaultMaxTokens
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > maxAllowedTokens) {
    return {
      ok: false,
      status: 500,
      code: 'invalid_token_limit',
      message: `${maxTokensVariable} must be an integer between 1 and ${maxAllowedTokens}.`,
    }
  }

  const apiKey = env.NEBIUS_API_KEY?.trim()
  const modelId = env.NEBIUS_MODEL?.trim()
  if (!apiKey || !modelId) {
    return {
      ok: false,
      status: 503,
      code: 'credentials_missing',
      message: 'Configure NEBIUS_API_KEY and NEBIUS_MODEL on the server before running the live agent.',
    }
  }

  return {
    ok: true,
    model: createNebiusModel({ apiKey, model: modelId, maxTokens, signal: options.signal ?? request.signal }),
    modelName: modelId,
    mode: 'live',
  }
}

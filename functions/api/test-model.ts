import { z } from 'zod'

interface Env {
  MOCK_MODE?: string
  NEBIUS_API_KEY?: string
  NEBIUS_MODEL?: string
}

interface PagesContext {
  request: Request
  env: Env
}

const requestSchema = z.object({
  prompt: z.string().trim().min(1).max(1000).optional(),
}).strict()

const completionSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string(),
    }),
  })).min(1),
})

const maxRequestBytes = 16 * 1024
const maxResponseBytes = 64 * 1024
const defaultPrompt = 'Reply with a short confirmation that the model is available.'

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

function isLocalRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)
}

function errorResponse(
  status: number,
  code: string,
  message: string,
): Response {
  return Response.json({ error: { code, message } }, { status })
}

export const onRequestPost = async ({ request, env }: PagesContext): Promise<Response> => {
  const bodyText = await readTextAtMost(request.body, maxRequestBytes)
  if (bodyText === null) {
    return errorResponse(413, 'request_too_large', 'Request body must be 16 KB or smaller.')
  }

  let body: unknown = {}
  if (bodyText.trim()) {
    try {
      body = JSON.parse(bodyText)
    } catch {
      return errorResponse(400, 'invalid_json', 'Request body must be valid JSON.')
    }
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse(400, 'invalid_request', 'Provide an optional prompt of up to 1000 characters.')
  }

  if (env.MOCK_MODE === 'true' && isLocalRequest(request)) {
    return Response.json({
      mode: 'mock',
      mock: true,
      output: 'Local mock response. No AI model was called.',
    })
  }

  const apiKey = env.NEBIUS_API_KEY?.trim()
  const model = env.NEBIUS_MODEL?.trim()
  if (!apiKey || !model) {
    return errorResponse(
      503,
      'credentials_missing',
      'Configure NEBIUS_API_KEY and NEBIUS_MODEL on the server, or enable local mock mode for local development.',
    )
  }

  try {
    const response = await fetch('https://api.tokenfactory.nebius.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: parsed.data.prompt ?? defaultPrompt }],
        max_tokens: 128,
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      return errorResponse(
        502,
        'upstream_error',
        `Nebius Token Factory returned HTTP ${response.status}. Check server-side model configuration.`,
      )
    }

    const responseText = await readTextAtMost(response.body, maxResponseBytes)
    if (responseText === null) {
      return errorResponse(502, 'upstream_response_too_large', 'Nebius returned an oversized response.')
    }

    let responseBody: unknown
    try {
      responseBody = JSON.parse(responseText)
    } catch {
      return errorResponse(502, 'invalid_upstream_response', 'Nebius returned an invalid response.')
    }

    const completion = completionSchema.safeParse(responseBody)
    if (!completion.success) {
      return errorResponse(502, 'invalid_upstream_response', 'Nebius returned an unexpected response format.')
    }

    return Response.json({
      mode: 'live',
      mock: false,
      model,
      output: completion.data.choices[0].message.content,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return errorResponse(504, 'upstream_timeout', 'The Nebius model request timed out.')
    }
    return errorResponse(502, 'upstream_unavailable', 'Could not reach Nebius Token Factory.')
  }
}

// Shared plumbing for the streaming agent endpoints (/api/audit and /api/compare):
// request parsing and the NDJSON response, with cancellation and error mapping.

import type { z } from 'zod'
import type { AuditStreamEvent } from './auditSchema.ts'
import { readTextAtMost } from './http.ts'
import { NebiusModelError } from './nebiusModel.ts'
import { AgentCancelledError } from './runtime.ts'

export const maxRequestBytes = 16 * 1024

export function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status })
}

/** Reasoning models may leave a <think> block in their text; the UI should never show it. */
export function stripReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*<\/think>/i, '').trim()
}

export async function parseRequest<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
  fallbackMessage: string,
): Promise<{ ok: true; data: z.infer<Schema> } | { ok: false; response: Response }> {
  const text = await readTextAtMost(request.body, maxRequestBytes)
  if (text === null) return { ok: false, response: errorResponse(413, 'request_too_large', 'Request body must be 16 KB or smaller.') }

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return { ok: false, response: errorResponse(400, 'invalid_json', 'Request body must be valid JSON.') }
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue?.path.length ? `${issue.path.join('.')}: ` : ''
    return { ok: false, response: errorResponse(400, 'invalid_request', `${where}${issue?.message ?? fallbackMessage}`) }
  }
  return { ok: true, data: parsed.data }
}

/**
 * Streams the events `execute` sends as NDJSON. If the browser disconnects the
 * controller is aborted, which stops model calls and website fetches.
 */
export function createStreamingResponse(
  controller: AbortController,
  execute: (send: (event: AuditStreamEvent) => void) => Promise<void>,
): Response {
  const stream = new TransformStream<Uint8Array, Uint8Array>()
  const writer = stream.writable.getWriter()
  const encoder = new TextEncoder()
  let open = true
  const send = (event: AuditStreamEvent) => {
    if (!open) return
    writer.write(encoder.encode(`${JSON.stringify(event)}\n`)).catch(() => {
      open = false
      controller.abort()
    })
  }

  void (async () => {
    try {
      await execute(send)
    } catch (error) {
      if (error instanceof AgentCancelledError || controller.signal.aborted) {
        send({ type: 'error', code: 'request_cancelled', message: 'The run was cancelled.' })
      } else if (error instanceof NebiusModelError) {
        send({ type: 'error', code: error.code, message: error.message })
      } else {
        send({ type: 'error', code: 'agent_run_failed', message: 'The agent run failed unexpectedly.' })
      }
    } finally {
      open = false
      await writer.close().catch(() => undefined)
    }
  })()

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

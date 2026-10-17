import { assertPublicHttpUrl, UnsafeUrlError } from './urlSafety.ts'

export const maxRedirects = 3
export const fetchTimeoutMs = 8_000
export const maxHtmlBytes = 512 * 1024
export const defaultRequestBudget = 24

export type FetchedPage = {
  requestedUrl: string
  finalUrl: string
  status: number
  redirects: string[]
  contentType: string
  responseMs: number
  htmlBytes: number
  truncated: boolean
  html: string
}

export class WebsiteFetchError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'WebsiteFetchError'
    this.code = code
  }
}

/** Shared cap on outbound website requests (including redirects) for one run. */
export class RequestBudget {
  private remaining: number

  constructor(limit = defaultRequestBudget) {
    this.remaining = limit
  }

  take(): void {
    if (this.remaining <= 0) {
      throw new WebsiteFetchError('request_budget_exhausted', 'The website request budget for this run is used up.')
    }
    this.remaining -= 1
  }
}

type SafeFetchOptions = {
  budget: RequestBudget
  fetchImplementation?: typeof fetch
  signal?: AbortSignal
  now?: () => number
}

async function readAtMost(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!body) return { bytes: new Uint8Array(), truncated: false }
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  let truncated = false
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const room = limit - length
    if (value.byteLength > room) {
      chunks.push(value.subarray(0, room))
      length += room
      truncated = true
      await reader.cancel()
      break
    }
    chunks.push(value)
    length += value.byteLength
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { bytes, truncated }
}

function charsetOf(contentType: string): string {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1]?.toLowerCase()
  try {
    return charset ? new TextDecoder(charset).encoding : 'utf-8'
  } catch {
    return 'utf-8'
  }
}

export async function fetchPublicPage(input: string, options: SafeFetchOptions): Promise<FetchedPage> {
  const fetchImplementation = options.fetchImplementation ?? fetch
  const now = options.now ?? Date.now
  const redirects: string[] = []
  let url: URL
  try {
    url = assertPublicHttpUrl(input)
  } catch (error) {
    throw new WebsiteFetchError('unsafe_url', error instanceof Error ? error.message : 'The URL is not allowed.')
  }
  const startedAt = now()
  const signals = [AbortSignal.timeout(fetchTimeoutMs)]
  if (options.signal) signals.push(options.signal)
  const signal = AbortSignal.any(signals)

  for (let hop = 0; ; hop += 1) {
    options.budget.take()
    let response: Response
    try {
      response = await fetchImplementation(url.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
          'User-Agent': 'ChaosPilotAudit/1.0 (website improvement demo; single page fetch)',
        },
      })
    } catch (error) {
      if (options.signal?.aborted) throw new WebsiteFetchError('cancelled', 'The run was cancelled.')
      if (error instanceof Error && (error.name === 'TimeoutError' || signal.aborted)) {
        throw new WebsiteFetchError('timeout', `The website did not respond within ${fetchTimeoutMs / 1000} seconds.`)
      }
      throw new WebsiteFetchError('network_error', 'The website could not be reached.')
    }

    if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
      await response.body?.cancel()
      if (hop >= maxRedirects) {
        throw new WebsiteFetchError('too_many_redirects', `The website redirected more than ${maxRedirects} times.`)
      }
      try {
        url = assertPublicHttpUrl(new URL(response.headers.get('location') ?? '', url))
      } catch (error) {
        const message = error instanceof UnsafeUrlError ? error.message : 'The redirect target is invalid.'
        throw new WebsiteFetchError('unsafe_redirect', `Blocked redirect: ${message}`)
      }
      redirects.push(url.toString())
      continue
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok) {
      await response.body?.cancel()
      throw new WebsiteFetchError('http_error', `The website responded with HTTP ${response.status}.`)
    }
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      await response.body?.cancel()
      throw new WebsiteFetchError('not_html', `The URL returned ${contentType.split(';')[0]} instead of an HTML page.`)
    }

    let body: { bytes: Uint8Array; truncated: boolean }
    try {
      body = await readAtMost(response.body, maxHtmlBytes)
    } catch {
      if (options.signal?.aborted) throw new WebsiteFetchError('cancelled', 'The run was cancelled.')
      throw new WebsiteFetchError('timeout', 'The website response could not be read in time.')
    }

    return {
      requestedUrl: input,
      finalUrl: url.toString(),
      status: response.status,
      redirects,
      contentType,
      responseMs: Math.max(0, Math.round(now() - startedAt)),
      htmlBytes: body.bytes.byteLength,
      truncated: body.truncated,
      html: new TextDecoder(charsetOf(contentType)).decode(body.bytes),
    }
  }
}

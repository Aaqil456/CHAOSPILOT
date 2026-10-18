import assert from 'node:assert/strict'
import test from 'node:test'
import { assertPublicHttpUrl } from './urlSafety.ts'
import { fetchPublicPage, maxHtmlBytes, RequestBudget, WebsiteFetchError } from './safeFetch.ts'
import { extractPageEvidence } from './pageEvidence.ts'

function htmlResponse(html: string, init: ResponseInit = {}): Response {
  return new Response(html, {
    status: 200,
    ...init,
    headers: { 'content-type': 'text/html; charset=utf-8', ...(init.headers ?? {}) },
  })
}

test('URL safety accepts public HTTP(S) domains and strips fragments', () => {
  assert.equal(assertPublicHttpUrl('https://www.kopicorner.com/menu#top').toString(), 'https://www.kopicorner.com/menu')
  assert.equal(assertPublicHttpUrl('http://example.com').toString(), 'http://example.com/')
})

test('URL safety rejects private, local, credentialed and non-HTTP destinations', () => {
  for (const url of [
    'ftp://example.com',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'http://localhost:8788',
    'http://127.0.0.1/',
    'http://2130706433/',
    'http://0x7f.1/',
    'http://10.0.0.5/',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/',
    'http://[fd00::1]/',
    'http://router.local/',
    'http://service.internal/',
    'http://intranet/',
    'https://user:pass@example.com/',
    'https://example.com:8443/',
    'not a url',
  ]) {
    assert.throws(() => assertPublicHttpUrl(url), `${url} should be rejected`)
  }
})

test('safe fetch re-validates every redirect and blocks redirects to private hosts', async () => {
  const requested: string[] = []
  const fetchImplementation: typeof fetch = async (input) => {
    requested.push(String(input))
    return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } })
  }
  await assert.rejects(
    fetchPublicPage('https://kopicorner.com/', { budget: new RequestBudget(), fetchImplementation }),
    (error: unknown) => error instanceof WebsiteFetchError && error.code === 'unsafe_redirect',
  )
  assert.deepEqual(requested, ['https://kopicorner.com/'])
})

test('safe fetch follows a bounded number of public redirects', async () => {
  const fetchImplementation: typeof fetch = async (input) => {
    const url = String(input)
    if (url === 'http://kopicorner.com/') {
      return new Response(null, { status: 301, headers: { location: 'https://www.kopicorner.com/' } })
    }
    return htmlResponse('<title>Kopi</title>')
  }
  const page = await fetchPublicPage('http://kopicorner.com/', { budget: new RequestBudget(), fetchImplementation })
  assert.equal(page.finalUrl, 'https://www.kopicorner.com/')
  assert.deepEqual(page.redirects, ['https://www.kopicorner.com/'])

  const loop: typeof fetch = async (input) =>
    new Response(null, { status: 302, headers: { location: `${String(input)}x` } })
  await assert.rejects(
    fetchPublicPage('https://kopicorner.com/', { budget: new RequestBudget(), fetchImplementation: loop }),
    (error: unknown) => error instanceof WebsiteFetchError && error.code === 'too_many_redirects',
  )
})

test('safe fetch truncates oversized HTML, rejects non-HTML and HTTP errors', async () => {
  const big = await fetchPublicPage('https://kopicorner.com/', {
    budget: new RequestBudget(),
    fetchImplementation: async () => htmlResponse('a'.repeat(maxHtmlBytes + 5000)),
  })
  assert.equal(big.truncated, true)
  assert.equal(big.htmlBytes, maxHtmlBytes)

  await assert.rejects(
    fetchPublicPage('https://kopicorner.com/logo.png', {
      budget: new RequestBudget(),
      fetchImplementation: async () => new Response('png', { headers: { 'content-type': 'image/png' } }),
    }),
    (error: unknown) => error instanceof WebsiteFetchError && error.code === 'not_html',
  )
  await assert.rejects(
    fetchPublicPage('https://kopicorner.com/', {
      budget: new RequestBudget(),
      fetchImplementation: async () => htmlResponse('nope', { status: 503 }),
    }),
    (error: unknown) => error instanceof WebsiteFetchError && error.code === 'http_error',
  )
})

test('safe fetch enforces the per-run request budget and reports cancellation', async () => {
  const budget = new RequestBudget(1)
  const fetchImplementation: typeof fetch = async () => htmlResponse('<p>ok</p>')
  await fetchPublicPage('https://kopicorner.com/', { budget, fetchImplementation })
  await assert.rejects(
    fetchPublicPage('https://kopicorner.com/', { budget, fetchImplementation }),
    (error: unknown) => error instanceof WebsiteFetchError && error.code === 'request_budget_exhausted',
  )

  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    fetchPublicPage('https://kopicorner.com/', {
      budget: new RequestBudget(),
      signal: controller.signal,
      fetchImplementation: async (_input, init) => {
        init?.signal?.throwIfAborted()
        return htmlResponse('unreachable')
      },
    }),
    (error: unknown) => error instanceof WebsiteFetchError && error.code === 'cancelled',
  )
})

test('evidence extraction summarises SEO, content, contact and CTA signals', () => {
  const html = `<!doctype html><html lang="en"><head>
    <title>Kopi Corner &amp; Bakery</title>
    <meta name="viewport" content="width=device-width">
    <meta property="og:title" content="Kopi">
    <link rel="stylesheet" href="/s.css">
    <script>var ignored = "<h1>not a heading</h1>";</script>
    <style>h1{color:red}</style>
  </head><body>
    <h1>Fresh coffee daily</h1>
    <h2>Our menu</h2><h2>Visit</h2>
    <img src="a.jpg"><img src="b.jpg" alt=""><img src="c.jpg" alt="Latte">
    <a href="/menu/">See menu</a>
    <a href="https://www.kopicorner.com/about">About</a>
    <a href="https://instagram.com/kopicorner">Instagram</a>
    <a href="tel:+60123456789">Call us</a>
    <a class="btn" href="/order">Order now</a>
    <form><input type="submit" value="Subscribe"></form>
    <p>Find us at 12 Jalan Bukit Bintang, Kuala Lumpur. Open every day from 7am.</p>
  </body></html>`
  const evidence = extractPageEvidence({
    requestedUrl: 'https://kopicorner.com/',
    finalUrl: 'https://kopicorner.com/',
    status: 200,
    redirects: [],
    contentType: 'text/html',
    responseMs: 120,
    htmlBytes: html.length,
    truncated: false,
    html,
  })

  assert.equal(evidence.title, 'Kopi Corner & Bakery')
  assert.equal(evidence.language, 'en')
  assert.equal(evidence.metaDescription, null)
  assert.equal(evidence.hasViewport, true)
  assert.deepEqual(evidence.openGraph, { title: true, image: false })
  assert.deepEqual(evidence.headings.h1, ['Fresh coffee daily'])
  assert.equal(evidence.headings.h2Count, 2)
  assert.deepEqual(evidence.images, { total: 3, missingAlt: 1 })
  assert.deepEqual(evidence.links.internalPaths, ['/menu', '/about', '/order'])
  assert.deepEqual(evidence.socialProfiles, ['instagram'])
  assert.equal(evidence.contact.phone, true)
  assert.equal(evidence.contact.address, true)
  assert.equal(evidence.contact.forms, 1)
  assert.ok(evidence.callsToAction.includes('Order now'))
  assert.ok(evidence.callsToAction.includes('Call us'))
  assert.ok(evidence.callsToAction.includes('Subscribe'))
  assert.equal(evidence.scripts, 1)
  assert.equal(evidence.likelyClientRendered, false)
  assert.doesNotMatch(evidence.textExcerpt, /ignored|color:red/)
})

test('evidence extraction flags JavaScript-only shells', () => {
  const html = '<html><head><script src="/app.js"></script></head><body><div id="root"></div></body></html>'
  const evidence = extractPageEvidence({
    requestedUrl: 'https://spa.com/',
    finalUrl: 'https://spa.com/',
    status: 200,
    redirects: [],
    contentType: 'text/html',
    responseMs: 50,
    htmlBytes: html.length,
    truncated: false,
    html,
  })
  assert.equal(evidence.wordCount, 0)
  assert.equal(evidence.likelyClientRendered, true)
})

test('HTML entities are decoded, and unknown symbol entities never leak into evidence', () => {
  const html = '<html><head><title>Caf&eacute; &amp; Bar &mdash; Open</title></head><body><a href="/menu">&equiv; Menu</a><a href="/book">&notarealentity; Book now</a></body></html>'
  const evidence = extractPageEvidence({
    requestedUrl: 'https://cafe.com/',
    finalUrl: 'https://cafe.com/',
    status: 200,
    redirects: [],
    contentType: 'text/html',
    responseMs: 10,
    htmlBytes: html.length,
    truncated: false,
    html,
  })
  assert.equal(evidence.title, 'Café & Bar — Open')
  assert.deepEqual(evidence.callsToAction, ['≡ Menu', 'Book now'])
  assert.doesNotMatch(JSON.stringify(evidence), /&[a-z]+;/i)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { extractPageEvidence } from './pageEvidence.ts'
import { biggestGaps, computeSiteScore, siteScoreSchema } from './siteScore.ts'

function evidenceFor(html: string, url = 'https://kopicorner.com/') {
  return extractPageEvidence({
    requestedUrl: url,
    finalUrl: url,
    status: 200,
    redirects: [],
    contentType: 'text/html',
    responseMs: 100,
    htmlBytes: html.length,
    truncated: false,
    html,
  })
}

const strongPage = `<!doctype html><html lang="en"><head>
  <title>Kopi Corner — fresh coffee in town</title>
  <meta name="viewport" content="width=device-width">
  <meta name="description" content="Kopi Corner serves freshly roasted coffee, pastries and breakfast every morning in the heart of the town centre.">
  <meta property="og:title" content="Kopi Corner"><meta property="og:image" content="/og.png">
  <script type="application/ld+json">{"@type":"CafeOrCoffeeShop"}</script>
  </head><body><h1>Fresh coffee daily</h1><h2>Menu</h2>
  <img src="a.jpg" alt="Latte"><a href="/order">Order now</a><a href="tel:+601">Call us</a><a href="mailto:hi@kopicorner.com">Email</a>
  <p>${'Coffee roasted every morning with care and patience. '.repeat(30)}</p></body></html>`

test('a well-built page scores 100 and every check passes', () => {
  const score = computeSiteScore(evidenceFor(strongPage))
  assert.equal(score.value, 100)
  assert.equal(score.possible, 100)
  assert.equal(score.band, 'strong')
  assert.ok(score.checks.every((item) => item.status === 'pass'))
  assert.equal(score.checks.reduce((total, item) => total + item.max, 0), 100)
  assert.equal(siteScoreSchema.safeParse(score).success, true)
})

test('a bare page loses points for each missing signal and explains each one', () => {
  const score = computeSiteScore(evidenceFor('<html><head><title>Hi</title></head><body><p>Hello</p></body></html>', 'http://kopicorner.com/'))
  assert.ok(score.value < 30)
  assert.equal(score.band, 'weak')
  const byId = Object.fromEntries(score.checks.map((item) => [item.id, item]))
  assert.equal(byId.https.points, 0)
  assert.equal(byId.viewport.points, 0)
  assert.equal(byId['meta-description'].detail, 'metaDescription: null')
  assert.equal(byId.cta.detail, 'callsToAction: []')
  assert.equal(byId.title.points, 3)
  assert.equal(byId['alt-text'].status, 'skipped')
  assert.equal(score.possible, 92)
})

test('partial credit: several H1s, short description, some images without alt text', () => {
  const html = `<html lang="en"><head><title>A decent page title</title><meta name="viewport" content="x"><meta name="description" content="Too short."></head>
    <body><h1>One</h1><h1>Two</h1><img src="a" alt="a"><img src="b"><img src="c" alt="c"><img src="d"></body></html>`
  const byId = Object.fromEntries(computeSiteScore(evidenceFor(html)).checks.map((item) => [item.id, item]))
  assert.equal(byId.h1.points, 4)
  assert.equal(byId['meta-description'].points, 6)
  assert.equal(byId['alt-text'].points, 4)
  assert.equal(byId['alt-text'].status, 'partial')
})

test('scoring is deterministic, flags limited evidence, and ranks gaps by points lost', () => {
  const spa = evidenceFor('<html><head><script src="/app.js"></script></head><body><div id="root"></div></body></html>')
  const first = computeSiteScore(spa)
  assert.deepEqual(first, computeSiteScore(spa))
  assert.equal(first.limitedEvidence, true)
  const gaps = biggestGaps(first)
  assert.ok(gaps.length > 0 && gaps.length <= 6)
  const lost = gaps.map((gap) => gap.max - gap.points)
  assert.deepEqual(lost, [...lost].sort((a, b) => b - a))
})

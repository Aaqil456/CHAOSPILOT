import assert from 'node:assert/strict'
import test from 'node:test'
import { onRequestPost } from './run.ts'

test('request route rejects an oversized body before parsing it', async () => {
  const request = new Request('https://chaospilot.test/api/run', {
    method: 'POST',
    body: 'x'.repeat(512 * 1024 + 1),
  })
  const response = await onRequestPost({ request, env: {} })
  assert.equal(response.status, 413)
  assert.equal((await response.json()).error.code, 'request_too_large')
})

test('request route rejects paths outside the project allowlist', async () => {
  const request = new Request('https://chaospilot.test/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'Create a site', files: { '../secret': 'bad' } }),
  })
  const response = await onRequestPost({ request, env: {} })
  assert.equal(response.status, 400)
  assert.equal((await response.json()).error.code, 'invalid_request')
})

test('valid project requests require server-side model configuration before inference', async () => {
  const request = new Request('https://chaospilot.test/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'Create a site', files: {} }),
  })
  const response = await onRequestPost({ request, env: {} })
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error.code, 'credentials_missing')
})

test('local mock mode generates a deterministic project without Nebius configuration', async () => {
  const request = new Request('http://127.0.0.1:8788/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'Create a site', files: {} }),
  })
  const response = await onRequestPost({ request, env: { MOCK_MODE: 'true' } })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.mode, 'mock')
  assert.equal(body.liveModel, false)
  assert.equal(body.model, 'local-deterministic-mock')
  assert.equal(typeof body.files['index.html'], 'string')
  assert.match(body.answer, /MOCK/)
})

test('mock mode does not enable mock generation on non-local hosts', async () => {
  const request = new Request('https://chaospilot.example/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'Create a site', files: {} }),
  })
  const response = await onRequestPost({ request, env: { MOCK_MODE: 'true' } })

  assert.equal(response.status, 503)
  assert.equal((await response.json()).error.code, 'credentials_missing')
})

test('existing projects are not overwritten during the generation-only milestone', async () => {
  const request = new Request('https://chaospilot.test/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: 'Change the site',
      files: { 'index.html': '<main>Existing project</main>' },
    }),
  })
  const response = await onRequestPost({
    request,
    env: { NEBIUS_API_KEY: 'not-used', NEBIUS_MODEL: 'not-used' },
  })
  assert.equal(response.status, 409)
  assert.equal((await response.json()).error.code, 'editing_not_available')
})

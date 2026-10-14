import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPreviewDocument,
  loadProject,
  previewSandbox,
  projectStorageKey,
  saveProject,
} from '../../src/projectState.ts'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem(key: string) {
      return values.get(key) ?? null
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    },
  }
}

test('project files and prompt restore from browser storage', () => {
  const storage = memoryStorage()
  const project = {
    task: 'Create a portfolio',
    files: { 'index.html': '<main>Saved</main>', 'styles.css': 'main{color:plum}' },
  }
  saveProject(storage, project)

  assert.equal(projectStorageKey, 'chaospilot.website-project.v1')
  assert.deepEqual(loadProject(storage), project)
})

test('rejects invalid or disallowed project data in browser storage', () => {
  const storage = memoryStorage()
  storage.setItem(projectStorageKey, '{invalid')
  assert.throws(() => loadProject(storage), /JSON/)
  storage.setItem(projectStorageKey, JSON.stringify({ task: 'x', files: { '../outside': 'unsafe' } }))
  assert.throws(() => loadProject(storage), /not allowed/)
})

test('preview includes a restrictive policy, CSS and JavaScript in a script-only sandbox', () => {
  const html = buildPreviewDocument({
    'index.html': '<!doctype html><html><head><title>Preview</title></head><body><h1>Hello</h1></body></html>',
    'styles.css': 'h1{color:purple}',
    'script.js': "document.querySelector('h1').textContent='Ready'",
  })
  assert.equal(previewSandbox, 'allow-scripts')
  assert.match(html, /^<!doctype html><meta http-equiv="Content-Security-Policy"/i)
  assert.match(html, /default-src 'none'/)
  assert.match(html, /connect-src 'none'/)
  assert.match(html, /form-action 'none'/)
  assert.match(html, /<style>h1\{color:purple\}<\/style>/)
  assert.match(html, /<script>document\.querySelector/)
})

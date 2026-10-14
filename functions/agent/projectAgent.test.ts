import assert from 'node:assert/strict'
import test from 'node:test'
import { agentTools } from './tools.ts'
import { ProjectWorkspace } from './projectFiles.ts'
import { mockModel } from './mockModel.ts'
import { runAgent } from './runtime.ts'

test('deterministic mock creates a previewable three-file site through real project tools', async () => {
  const workspace = new ProjectWorkspace({})
  const result = await runAgent({
    task: 'Create a simple website.',
    businesses: [],
    instructions: 'Test instructions.',
    model: mockModel,
    tools: agentTools,
    workspace,
  })

  assert.match(result.answer, /MOCK/)
  assert.equal(result.trace[0]?.name, 'list_files')
  assert.deepEqual(Object.keys(workspace.snapshot()), ['index.html', 'styles.css', 'script.js'])
  assert.equal(result.trace.filter((operation) => operation.name === 'write_file').length, 3)
  assert.ok(result.trace.every((operation) => operation.status === 'completed'))
})

test('mock leaves existing project files unchanged while creating only a missing file', async () => {
  const originalHtml = '<main>Keep this site</main>'
  const originalCss = 'body{color:teal}'
  const workspace = new ProjectWorkspace({
    'index.html': originalHtml,
    'styles.css': originalCss,
  })
  const result = await runAgent({
    task: 'Finish the project.',
    businesses: [],
    instructions: 'Test instructions.',
    model: mockModel,
    tools: agentTools,
    workspace,
  })

  assert.equal(workspace.snapshot()['index.html'], originalHtml)
  assert.equal(workspace.snapshot()['styles.css'], originalCss)
  assert.ok(workspace.snapshot()['script.js'])
  assert.deepEqual(result.trace.map((operation) => operation.name), ['list_files', 'write_file'])
  assert.match(result.answer, /MOCK/)
})

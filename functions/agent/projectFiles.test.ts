import assert from 'node:assert/strict'
import test from 'node:test'
import {
  maxProjectFileBytes,
  maxProjectOperations,
  ProjectWorkspace,
  validateProjectFiles,
} from './projectFiles.ts'

test('allows only the three named web project files', () => {
  assert.deepEqual(validateProjectFiles({
    'index.html': '<h1>Hello</h1>',
    'styles.css': 'h1{color:purple}',
  }), {
    'index.html': '<h1>Hello</h1>',
    'styles.css': 'h1{color:purple}',
  })
  assert.throws(() => validateProjectFiles({ '../secret.txt': 'nope' }), /not allowed/)
  assert.throws(() => validateProjectFiles({ 'folder/index.html': 'nope' }), /not allowed/)
  assert.throws(() => validateProjectFiles({ 'script.js': '', 'styles.css': '', 'index.html': '', extra: '' }), /no more than three files|not allowed/)
})

test('reads existing files in bounded chunks and creates only missing files', () => {
  const workspace = new ProjectWorkspace({
    'index.html': '<h1>Original</h1>',
    'styles.css': 'h1{color:navy}',
  })
  workspace.writeFile('script.js', 'console.log("ready")')
  assert.deepEqual(workspace.readFile('index.html'), {
    path: 'index.html',
    content: '<h1>Original</h1>',
    totalCharacters: 17,
    nextOffset: null,
  })
  assert.throws(() => workspace.writeFile('index.html', 'overwritten'), /not enabled/)

  assert.deepEqual(workspace.snapshot(), {
    'index.html': '<h1>Original</h1>',
    'styles.css': 'h1{color:navy}',
    'script.js': 'console.log("ready")',
  })
  assert.deepEqual(workspace.listFiles().map(({ path }) => path), ['index.html', 'styles.css', 'script.js'])
  assert.throws(() => workspace.writeFile('../outside.js', 'bad'), /allowlist/)
})

test('enforces per-file, aggregate-size, file-count, and operation limits without partial writes', () => {
  const workspace = new ProjectWorkspace({})
  assert.throws(() => workspace.writeFile('index.html', 'x'.repeat(maxProjectFileBytes + 1)), /64 KB/)
  workspace.writeFile('index.html', 'x'.repeat(maxProjectFileBytes))
  workspace.writeFile('styles.css', 'y'.repeat(maxProjectFileBytes))
  assert.throws(() => workspace.writeFile('script.js', 'z'.repeat(maxProjectFileBytes)), /total size limit/)
  assert.equal(workspace.snapshot()['script.js'], undefined)

  const limited = new ProjectWorkspace({})
  for (let operation = 0; operation < maxProjectOperations; operation += 1) limited.listFiles()
  assert.throws(() => limited.listFiles(), /operation limit/)
})

test('reads larger project files in explicit chunks', () => {
  const workspace = new ProjectWorkspace({ 'index.html': 'abcdef' })
  assert.deepEqual(workspace.readFile('index.html', 0, 3), {
    path: 'index.html',
    content: 'abc',
    totalCharacters: 6,
    nextOffset: 3,
  })
  assert.deepEqual(workspace.readFile('index.html', 3, 3), {
    path: 'index.html',
    content: 'def',
    totalCharacters: 6,
    nextOffset: null,
  })
})

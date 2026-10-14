import type { AgentModel, AgentModelInput } from './runtime'

function mockDecision(input: AgentModelInput) {
  const toolMessages = input.messages.filter((message) => message.role === 'tool')
  const listedFiles = toolMessages.find((message) => message.toolName === 'list_files')
  if (!listedFiles) {
    return { type: 'tool_calls' as const, toolCalls: [{ id: 'mock-list', name: 'list_files', arguments: {} }] }
  }

  let existingPaths: string[]
  try {
    const result = JSON.parse(listedFiles.content) as { files?: Array<{ path?: string }> }
    existingPaths = result.files?.flatMap((file) => typeof file.path === 'string' ? [file.path] : []) ?? []
  } catch {
    return { type: 'final' as const, content: '[MOCK] Existing project inventory was invalid; no files were changed.' }
  }

  const written = new Set(toolMessages.filter((message) => message.toolName === 'write_file')
    .map((message) => {
      try {
        return (JSON.parse(message.content) as { path?: string }).path
      } catch {
        return undefined
      }
    }))
  const knownPaths = new Set([...existingPaths, ...[...written].filter((path): path is string => Boolean(path))])
  if (!knownPaths.has('index.html')) {
    return {
      type: 'tool_calls' as const,
      toolCalls: [{
        id: 'mock-write-html',
        name: 'write_file',
        arguments: {
          path: 'index.html',
          content: '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>My First Website</title></head><body><main><p>CHAOSPILOT · MOCK PREVIEW</p><h1>A place to begin.</h1><p>This deterministic fixture demonstrates the file-operation loop. It is not AI-generated.</p><button id="hello">Say hello</button><output id="message"></output></main></body></html>',
        },
      }],
    }
  }

  if (!knownPaths.has('styles.css')) {
    return {
      type: 'tool_calls' as const,
      toolCalls: [{
        id: 'mock-write-css',
        name: 'write_file',
        arguments: {
          path: 'styles.css',
          content: 'body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111217;color:#f3f0ff;font:16px system-ui}main{max-width:38rem;padding:3rem}h1{font-size:clamp(2.5rem,8vw,5rem)}button{padding:.8rem 1rem;border:0;border-radius:.5rem;background:#a491ff;color:#111217}',
        },
      }],
    }
  }

  if (!knownPaths.has('script.js')) {
    return {
      type: 'tool_calls' as const,
      toolCalls: [{
        id: 'mock-write-js',
        name: 'write_file',
        arguments: {
          path: 'script.js',
          content: "document.querySelector('#hello')?.addEventListener('click',()=>{document.querySelector('#message').textContent='Hello from the isolated preview!'})",
        },
      }],
    }
  }

  return {
    type: 'final' as const,
    content: '[MOCK] A deterministic example project is ready. This did not call Nebius and does not prove live model tool-calling works.',
  }
}

export const mockModel: AgentModel = {
  async decide(input) {
    return mockDecision(input)
  },
}

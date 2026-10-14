import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const sources = [
  ['agentInstructions', '../functions/agent/AGENT.md'],
]

const moduleContents = sources.map(([name, relativePath]) => {
  const content = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
  return `export const ${name} = ${JSON.stringify(content)}`
}).join('\n')

const outputPath = fileURLToPath(new URL(
  '../functions/agent/instructions.generated.ts',
  import.meta.url,
))
writeFileSync(outputPath, `${moduleContents}\n`, 'utf8')

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const sources = [
  ['auditAgentInstructions', '../functions/agent/AUDIT_AGENT.md'],
  ['compareAgentInstructions', '../functions/agent/COMPARE_AGENT.md'],
  ['websiteInspection', '../functions/agent/skills/website-inspection/SKILL.md'],
  ['competitorResearch', '../functions/agent/skills/competitor-research/SKILL.md'],
  ['websiteAnalysis', '../functions/agent/skills/website-analysis/SKILL.md'],
  ['contentGeneration', '../functions/agent/skills/content-generation/SKILL.md'],
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

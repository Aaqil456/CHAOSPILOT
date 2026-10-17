import type { AuditBusiness } from '../../functions/agent/auditSchema.ts'
import type { TimelineStep } from './auditRun.ts'

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function parseOutput(output: string | undefined): Record<string, unknown> {
  if (!output) return {}
  try {
    return record(JSON.parse(output))
  } catch {
    return {}
  }
}

export function businessName(businesses: AuditBusiness[], id: unknown): string {
  return businesses.find((business) => business.id === id)?.name ?? (typeof id === 'string' ? id : 'unknown business')
}

export function describeStep(step: TimelineStep, businesses: AuditBusiness[]): { title: string; detail: string } {
  const input = record(step.input)
  const output = parseOutput(step.output)
  const name = businessName(businesses, input.business_id)
  const error = typeof output.error === 'string' ? output.error : ''
  const issues = Array.isArray(output.issues) ? output.issues.filter((issue) => typeof issue === 'string') : []

  let title = step.name.replaceAll('_', ' ')
  let detail = ''
  if (step.name === 'inspect_website') {
    title = `Inspect homepage · ${name}`
    const evidence = record(output.evidence)
    if (evidence.url) {
      detail = `HTTP ${evidence.status} · ${evidence.responseMs} ms · ${evidence.htmlKB} KB · ${evidence.title ? `“${evidence.title}”` : 'no <title>'}`
    }
  } else if (step.name === 'inspect_page') {
    title = `Inspect ${typeof input.path === 'string' ? input.path : 'page'} · ${name}`
    const page = record(output.page)
    if (page.url) detail = `HTTP ${page.status} · ${page.wordCount} words · ${page.title ? `“${page.title}”` : 'no <title>'}`
  } else if (step.name === 'save_proposal') {
    title = `Save proposal · ${name}`
    if (output.saved) detail = `${output.findings} evidence-based finding${output.findings === 1 ? '' : 's'} saved`
  }

  if (step.status === 'running') detail = step.name === 'save_proposal' ? 'Validating proposal…' : 'Fetching on the server…'
  if (step.status === 'error') detail = [error || 'The step failed.', ...issues].join(' · ')
  return { title, detail }
}

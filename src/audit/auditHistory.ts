import { auditRunSchema, type AuditRun } from './auditRun.ts'

export const auditHistoryKey = 'chaospilot.audit-history.v1'
export const maxHistoryEntries = 8

/** Reads saved runs, silently dropping entries that no longer match the schema. */
export function loadHistory(storage: Pick<Storage, 'getItem'>): AuditRun[] {
  let saved: string | null
  try {
    saved = storage.getItem(auditHistoryKey)
  } catch {
    return []
  }
  if (!saved) return []
  let value: unknown
  try {
    value = JSON.parse(saved)
  } catch {
    return []
  }
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const parsed = auditRunSchema.safeParse(entry)
    return parsed.success && parsed.data.status !== 'running' ? [parsed.data] : []
  }).slice(0, maxHistoryEntries)
}

/** Saves runs newest-first. When storage is full, older runs are dropped first. */
export function saveHistory(storage: Pick<Storage, 'setItem'>, runs: AuditRun[]): boolean {
  let entries = runs.filter((run) => run.status !== 'running').slice(0, maxHistoryEntries)
  while (entries.length > 0) {
    try {
      storage.setItem(auditHistoryKey, JSON.stringify(entries))
      return true
    } catch {
      entries = entries.slice(0, -1)
    }
  }
  try {
    storage.setItem(auditHistoryKey, '[]')
  } catch {
    // Storage is unavailable; history stays in memory only.
  }
  return false
}

export function upsertRun(runs: AuditRun[], run: AuditRun): AuditRun[] {
  return [run, ...runs.filter((candidate) => candidate.id !== run.id)].slice(0, maxHistoryEntries)
}

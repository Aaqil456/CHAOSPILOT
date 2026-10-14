import { validateProjectFiles } from '../functions/agent/projectFiles.ts'
import type { ProjectFiles } from '../functions/agent/projectFiles.ts'

export const projectStorageKey = 'chaospilot.website-project.v1'
export const previewSandbox = 'allow-scripts'
export type SavedProject = { task: string; files: ProjectFiles }

export function loadProject(storage: Pick<Storage, 'getItem'>): SavedProject {
  const saved = storage.getItem(projectStorageKey)
  if (!saved) return { task: '', files: {} }
  const parsed: unknown = JSON.parse(saved)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Saved project data is invalid.')
  }
  const value = parsed as Record<string, unknown>
  if (typeof value.task !== 'string') throw new Error('Saved project prompt is invalid.')
  return { task: value.task, files: validateProjectFiles(value.files) }
}

export function saveProject(storage: Pick<Storage, 'setItem'>, project: SavedProject): void {
  storage.setItem(projectStorageKey, JSON.stringify(project))
}

export function buildPreviewDocument(files: ProjectFiles): string {
  const html = files['index.html'] ?? '<!doctype html><html><body><p>Your generated website preview will appear here.</p></body></html>'
  const css = (files['styles.css'] ?? '').replace(/<\/style/gi, '<\\/style')
  const script = (files['script.js'] ?? '').replace(/<\/script/gi, '<\\/script')
  const policy = [
    "default-src 'none'",
    "base-uri 'none'",
    "connect-src 'none'",
    "child-src 'none'",
    "frame-src 'none'",
    "font-src data:",
    "form-action 'none'",
    "img-src data:",
    "manifest-src 'none'",
    "media-src data:",
    "navigate-to 'none'",
    "object-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "worker-src 'none'",
  ].join('; ')
  const contentSecurityPolicy = `<meta http-equiv="Content-Security-Policy" content="${policy}">`
  const doctype = html.match(/^\s*<!doctype[^>]*>/i)?.[0] ?? '<!doctype html>'
  const content = html.replace(/^\s*<!doctype[^>]*>/i, '')
  const style = css ? `<style>${css}</style>` : ''
  const code = script ? `<script>${script}</script>` : ''
  if (!/<html\b/i.test(content)) {
    return `${doctype}${contentSecurityPolicy}<html><head>${style}</head><body>${content}${code}</body></html>`
  }

  let document = `${doctype}${contentSecurityPolicy}${content}`
  if (/<head\b[^>]*>/i.test(document)) {
    document = document.replace(/<head\b[^>]*>/i, (openingTag) => `${openingTag}${style}`)
  } else {
    document = document.replace(/<html\b[^>]*>/i, (openingTag) => `${openingTag}<head>${style}</head>`)
  }
  if (code) {
    document = /<\/body\s*>/i.test(document)
      ? document.replace(/<\/body\s*>/i, `${code}</body>`)
      : `${document}${code}`
  }
  return document
}

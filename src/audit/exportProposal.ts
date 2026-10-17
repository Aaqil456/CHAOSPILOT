import type { AuditBusiness, Proposal } from '../../functions/agent/auditSchema.ts'

export type ExportFormat = 'txt' | 'html' | 'pdf'

/** Everything in a proposal is model-written, so it is escaped before it reaches HTML. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char
  ))
}

export function exportFileName(name: string, extension: 'txt' | 'html' | 'pdf'): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'business'
  return `${slug}-proposal.${extension}`
}

export function proposalAsText(proposal: Proposal, business: AuditBusiness | undefined): string {
  const name = business?.name ?? proposal.businessId
  const findings = proposal.findings.map((finding, index) =>
    `${index + 1}. [${finding.impact.toUpperCase()}] ${finding.title}\n   Evidence: ${finding.evidence}\n   Recommendation: ${finding.recommendation}`).join('\n\n')
  return `${name} — ${business?.url ?? ''}\n\n${proposal.summary}\n\nFINDINGS\n\n${findings}\n\nPROPOSAL (DRAFT — NOT SENT)\n\nSubject: ${proposal.emailSubject}\n\n${proposal.emailBody}\n`
}

const impactColors = { high: '#b42318', medium: '#b54708', low: '#175cd3' } as const

export function proposalAsHtml(proposal: Proposal, business: AuditBusiness | undefined): string {
  const name = business?.name ?? proposal.businessId
  const url = business?.url ?? ''
  const findings = proposal.findings.map((finding) => `
      <li>
        <div class="finding-head"><span class="impact" style="color:${impactColors[finding.impact]}">${escapeHtml(finding.impact.toUpperCase())}</span> <strong>${escapeHtml(finding.title)}</strong></div>
        <code>${escapeHtml(finding.evidence)}</code>
        <p>${escapeHtml(finding.recommendation)}</p>
      </li>`).join('')
  const paragraphs = proposal.emailBody.split(/\n{2,}/).map((paragraph) =>
    `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`).join('\n      ')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(name)} — website proposal</title>
<style>
  body { max-width: 760px; margin: 2rem auto; padding: 0 1.25rem; color: #1d2433; font: 16px/1.6 system-ui, -apple-system, 'Segoe UI', sans-serif; }
  h1 { margin: 0 0 .25rem; font-size: 1.7rem; }
  h2 { margin: 2rem 0 .75rem; padding-bottom: .35rem; border-bottom: 1px solid #d5d9e2; font-size: 1.05rem; letter-spacing: .04em; text-transform: uppercase; color: #475067; }
  .site { margin: 0; color: #475067; overflow-wrap: anywhere; }
  .draft { display: inline-block; margin-top: .75rem; padding: .15rem .55rem; border: 1px solid #d5d9e2; border-radius: 4px; color: #475067; font-size: .8rem; }
  ol { margin: 0; padding: 0; list-style: none; }
  li { margin-bottom: .9rem; padding: .75rem .9rem; border: 1px solid #d5d9e2; border-radius: 6px; break-inside: avoid; }
  .impact { font-size: .75rem; font-weight: 700; letter-spacing: .05em; }
  li code { display: inline-block; margin-top: .35rem; padding: .1rem .4rem; border-radius: 4px; background: #eef2f6; font-size: .85rem; overflow-wrap: anywhere; }
  li p { margin: .4rem 0 0; }
  .email { padding: 1rem 1.15rem; border: 1px solid #d5d9e2; border-radius: 6px; background: #f8f9fb; }
  .email p { margin: 0 0 .85rem; }
  .email p:last-child { margin-bottom: 0; }
  @media print { body { margin: 0; max-width: none; } }
</style>
</head>
<body>
  <h1>${escapeHtml(name)}</h1>
  <p class="site">${escapeHtml(url)}</p>
  <span class="draft">Draft proposal — not sent</span>
  <h2>Summary</h2>
  <p>${escapeHtml(proposal.summary)}</p>
  <h2>Findings from inspection</h2>
  <ol>${findings}
  </ol>
  <h2>Proposal</h2>
  <div class="email">
    <p><strong>Subject: ${escapeHtml(proposal.emailSubject)}</strong></p>
      ${paragraphs}
  </div>
</body>
</html>
`
}

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Renders the proposal in a hidden frame and opens the print dialog ("Save as PDF"). */
function printAsPdf(html: string, title: string): void {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.title = title
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  const cleanup = () => window.setTimeout(() => frame.remove(), 500)
  frame.addEventListener('load', () => {
    const view = frame.contentWindow
    if (!view) return cleanup()
    view.addEventListener('afterprint', cleanup)
    view.focus()
    view.print()
    // Some browsers never fire afterprint; do not leave the frame behind.
    window.setTimeout(() => frame.remove(), 120_000)
  })
  frame.srcdoc = html
  document.body.append(frame)
}

export function exportProposal(format: ExportFormat, proposal: Proposal, business: AuditBusiness | undefined): void {
  const name = business?.name ?? proposal.businessId
  if (format === 'txt') {
    saveBlob(new Blob([proposalAsText(proposal, business)], { type: 'text/plain;charset=utf-8' }), exportFileName(name, 'txt'))
  } else if (format === 'html') {
    saveBlob(new Blob([proposalAsHtml(proposal, business)], { type: 'text/html;charset=utf-8' }), exportFileName(name, 'html'))
  } else {
    printAsPdf(proposalAsHtml(proposal, business), exportFileName(name, 'pdf'))
  }
}

import { CircleAlert, ExternalLink, Search } from 'lucide-react'
import type { AuditBusiness, InspectionSummary } from '../../functions/agent/auditSchema'
import type { PageEvidence } from '../../functions/agent/pageEvidence'

type EvidencePanelProps = {
  businesses: AuditBusiness[]
  inspections: InspectionSummary[]
}

type Signal = { label: string; value: string; good: boolean | null }

function signals(evidence: Partial<PageEvidence>): Signal[] {
  const ctas = evidence.callsToAction ?? []
  const contact = evidence.contact
  const contactRoutes = contact ? [contact.phone && 'phone', contact.email && 'email', contact.forms ? `${contact.forms} form` : ''].filter(Boolean) : []
  return [
    { label: 'HTTPS', value: evidence.https ? 'Yes' : 'No', good: Boolean(evidence.https) },
    { label: 'Mobile viewport', value: evidence.hasViewport ? 'Yes' : 'Missing', good: Boolean(evidence.hasViewport) },
    { label: 'Meta description', value: evidence.metaDescription ? 'Present' : 'Missing', good: Boolean(evidence.metaDescription) },
    { label: 'H1 headings', value: String(evidence.headings?.h1Count ?? 0), good: evidence.headings?.h1Count === 1 },
    { label: 'Calls to action', value: ctas.length ? ctas.slice(0, 3).join(', ') : 'None found', good: ctas.length > 0 },
    { label: 'Contact routes', value: contactRoutes.length ? contactRoutes.join(', ') : 'None found', good: contactRoutes.length > 0 },
    { label: 'Images without alt', value: `${evidence.images?.missingAlt ?? 0} of ${evidence.images?.total ?? 0}`, good: (evidence.images?.missingAlt ?? 0) === 0 },
    { label: 'Social preview', value: evidence.openGraph?.image ? 'og:image set' : 'No og:image', good: Boolean(evidence.openGraph?.image) },
    { label: 'HTML size', value: `${evidence.htmlKB ?? 0} KB`, good: null },
    { label: 'Response time', value: `${evidence.responseMs ?? 0} ms`, good: null },
  ]
}

export function EvidencePanel({ businesses, inspections }: EvidencePanelProps) {
  if (inspections.length === 0) return null
  return (
    <div className="evidence-list">
      {inspections.map((inspection) => {
        const business = businesses.find((candidate) => candidate.id === inspection.businessId)
        const evidence = (inspection.evidence ?? {}) as Partial<PageEvidence>
        return (
          <article className={`evidence-card evidence-${inspection.status}`} key={inspection.businessId}>
            <div className="evidence-card-head">
              <div>
                <strong>{business?.name ?? inspection.businessId}</strong>
                {evidence.url
                  ? <a href={evidence.url} target="_blank" rel="noreferrer">{evidence.url.replace(/^https?:\/\//, '')}<ExternalLink size={11} /></a>
                  : <span className="evidence-url">{business?.url}</span>}
              </div>
              <span className={`evidence-status status-${inspection.status}`}>
                {inspection.status === 'inspected' ? `${inspection.pages.length} PAGE${inspection.pages.length === 1 ? '' : 'S'} FETCHED` : inspection.status === 'failed' ? 'FETCH FAILED' : 'NOT INSPECTED'}
              </span>
            </div>
            {inspection.status === 'inspected' ? (
              <>
                {(evidence.likelyClientRendered || evidence.truncated) && (
                  <p className="evidence-warning"><CircleAlert size={13} /> {evidence.likelyClientRendered ? 'Page content appears to be rendered by JavaScript; evidence is limited.' : 'Page was larger than 512 KB; only the first part was analysed.'}</p>
                )}
                <dl className="evidence-grid">
                  {signals(evidence).map((signal) => (
                    <div key={signal.label} className={signal.good === null ? '' : signal.good ? 'signal-good' : 'signal-bad'}>
                      <dt>{signal.label}</dt>
                      <dd>{signal.value}</dd>
                    </div>
                  ))}
                </dl>
                {evidence.title !== undefined && <p className="evidence-title"><Search size={12} /> Title: {evidence.title ?? <em>missing</em>}</p>}
              </>
            ) : (
              <p className="evidence-warning"><CircleAlert size={13} /> {inspection.error ?? 'The agent did not inspect this website.'}</p>
            )}
          </article>
        )
      })}
    </div>
  )
}

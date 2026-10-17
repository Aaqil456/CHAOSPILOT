import { useState } from 'react'
import { Check, Copy, Download, ExternalLink, Pencil } from 'lucide-react'
import type { AuditBusiness, Proposal } from '../../functions/agent/auditSchema'

type ProposalCardProps = {
  proposal: Proposal
  business: AuditBusiness | undefined
  index: number
  edited: boolean
  onChange: (changes: Partial<Pick<Proposal, 'emailSubject' | 'emailBody'>>) => void
}

const accents = ['lavender', 'peach', 'mint']

function proposalText(proposal: Proposal): string {
  return `Subject: ${proposal.emailSubject}\n\n${proposal.emailBody}`
}

function fileName(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'business'}-proposal.txt`
}

export function ProposalCard({ proposal, business, index, edited, onChange }: ProposalCardProps) {
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const name = business?.name ?? proposal.businessId
  const accent = accents[index % accents.length]

  async function copyProposal() {
    try {
      await navigator.clipboard.writeText(proposalText(proposal))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  function downloadProposal() {
    const findings = proposal.findings.map((finding, findingIndex) =>
      `${findingIndex + 1}. [${finding.impact.toUpperCase()}] ${finding.title}\n   Evidence: ${finding.evidence}\n   Recommendation: ${finding.recommendation}`).join('\n\n')
    const text = `${name} — ${business?.url ?? ''}\n\n${proposal.summary}\n\nFINDINGS\n\n${findings}\n\nPROPOSAL\n\n${proposalText(proposal)}\n`
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = fileName(name)
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <article className={`proposal-card proposal-${accent}`}>
      <div className="proposal-card-top">
        <div className="proposal-business">
          <span className={`proposal-monogram monogram-${accent}`}>{name.slice(0, 1).toUpperCase() || 'B'}</span>
          <div>
            <strong>{name}</strong>
            {business && <a href={business.url} target="_blank" rel="noreferrer">{business.url.replace(/^https?:\/\//, '')}<ExternalLink size={11} /></a>}
          </div>
        </div>
        {edited && <span className="proposal-edited">EDITED</span>}
      </div>

      <div className="proposal-card-body">
        <p className="proposal-intro">{proposal.summary}</p>

        <div className="opportunity-heading"><span>FINDINGS FROM INSPECTION</span><span>{proposal.findings.length} ITEMS</span></div>
        <ol className="finding-list">
          {proposal.findings.map((finding, findingIndex) => (
            <li key={`${finding.title}-${findingIndex}`}>
              <div className="finding-head">
                <span className={`impact-badge impact-${finding.impact}`}>{finding.impact.toUpperCase()}</span>
                <strong>{finding.title}</strong>
              </div>
              <code className="finding-evidence">{finding.evidence}</code>
              <p>{finding.recommendation}</p>
            </li>
          ))}
        </ol>

        <div className="opportunity-heading"><span>DRAFT PROPOSAL · NOT SENT</span></div>
        {editing ? (
          <div className="proposal-edit-fields">
            <label className="field-label" htmlFor={`subject-${proposal.businessId}`}>SUBJECT</label>
            <input id={`subject-${proposal.businessId}`} className="proposal-subject-input" value={proposal.emailSubject} maxLength={140} onChange={(event) => onChange({ emailSubject: event.target.value })} />
            <label className="field-label" htmlFor={`body-${proposal.businessId}`}>MESSAGE</label>
            <textarea id={`body-${proposal.businessId}`} className="proposal-editor" value={proposal.emailBody} rows={10} maxLength={5000} onChange={(event) => onChange({ emailBody: event.target.value })} />
          </div>
        ) : (
          <div className="proposal-email">
            <strong>{proposal.emailSubject}</strong>
            <p>{proposal.emailBody}</p>
          </div>
        )}
      </div>

      <div className="proposal-card-actions">
        <button type="button" className="proposal-edit-button" onClick={() => setEditing((value) => !value)}>
          {editing ? <><Check size={13} /> Done editing</> : <><Pencil size={12} /> Edit proposal</>}
        </button>
        <button type="button" className="proposal-copy-button" onClick={() => void copyProposal()} aria-label={`Copy ${name} proposal`}>
          {copied ? <><Check size={13} /> Copied</> : <><Copy size={12} /> Copy</>}
        </button>
        <button type="button" className="proposal-copy-button" onClick={downloadProposal} aria-label={`Download ${name} proposal`}>
          <Download size={12} /> .txt
        </button>
      </div>
    </article>
  )
}

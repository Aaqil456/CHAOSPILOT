import { useState } from 'react'
import { Check, Copy, ExternalLink, Pencil, Sparkles } from 'lucide-react'
import type { ProposalDraft } from '../types'

type ProposalCardProps = {
  proposal: ProposalDraft
}

export function ProposalCard({ proposal }: ProposalCardProps) {
  const [editing, setEditing] = useState(false)
  const [intro, setIntro] = useState(proposal.intro)
  const [copied, setCopied] = useState(false)

  async function copyProposal() {
    const text = `${proposal.headline}\n\n${intro}\n\n${proposal.opportunities.map((item) => `• ${item}`).join('\n')}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <article className={`proposal-card proposal-${proposal.accent}`}>
      <div className="proposal-card-top">
        <div className="proposal-business">
          <span className={`proposal-monogram monogram-${proposal.accent}`}>{proposal.business.name.slice(0, 1).toUpperCase() || 'B'}</span>
          <div><strong>{proposal.business.name || 'Untitled business'}</strong><a href={proposal.business.url} target="_blank" rel="noreferrer">{proposal.business.url.replace(/^https?:\/\//, '')}<ExternalLink size={11} /></a></div>
        </div>
        <div className="proposal-score"><Sparkles size={12} /><strong>{proposal.score}</strong><span>FIT</span></div>
      </div>
      <div className="proposal-card-body">
        <span className="proposal-kicker">A GROWTH OPPORTUNITY</span>
        <h3>{proposal.headline}</h3>
        {editing ? (
          <label className="visually-hidden" htmlFor={`proposal-${proposal.business.id}`}>Edit proposal introduction</label>
        ) : null}
        {editing
          ? <textarea id={`proposal-${proposal.business.id}`} className="proposal-editor" value={intro} onChange={(event) => setIntro(event.target.value)} rows={4} />
          : <p className="proposal-intro">{intro}</p>}
        <div className="opportunity-heading"><span>RECOMMENDED NEXT STEPS</span><span>{proposal.opportunities.length} IDEAS</span></div>
        <ul className="opportunity-list">
          {proposal.opportunities.map((opportunity, index) => (
            <li key={opportunity}><span className="opportunity-index">{String(index + 1).padStart(2, '0')}</span><span>{opportunity}</span></li>
          ))}
        </ul>
      </div>
      <div className="proposal-card-actions">
        <button type="button" className="proposal-edit-button" onClick={() => setEditing((value) => !value)}>
          {editing ? <><Check size={13} /> Save draft</> : <><Pencil size={12} /> Edit proposal</>}
        </button>
        <button type="button" className="proposal-copy-button" onClick={copyProposal} aria-label={`Copy ${proposal.business.name} proposal`}>
          {copied ? <><Check size={13} /> Copied</> : <><Copy size={12} /> Copy</>}
        </button>
      </div>
    </article>
  )
}

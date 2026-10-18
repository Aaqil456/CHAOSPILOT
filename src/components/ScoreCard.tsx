import { Check, CircleAlert, CircleMinus, Minus, X } from 'lucide-react'
import type { CSSProperties } from 'react'
import { scoreLabel, type ScoreCheck, type SiteScore } from '../../functions/agent/siteScore'

const bandText = { strong: 'STRONG BASICS', fair: 'ROOM TO IMPROVE', weak: 'NEEDS WORK' } as const

export function CheckIcon({ status }: { status: ScoreCheck['status'] }) {
  if (status === 'pass') return <Check size={13} aria-label="Passed" />
  if (status === 'partial') return <CircleMinus size={13} aria-label="Partly passed" />
  if (status === 'fail') return <X size={13} aria-label="Failed" />
  return <Minus size={13} aria-label="Not applicable" />
}

export function ScoreRing({ score, size = 'large' }: { score: SiteScore; size?: 'large' | 'small' }) {
  return (
    <div
      className={`score-ring score-${score.band} score-ring-${size}`}
      style={{ '--score': score.value } as CSSProperties}
      role="img"
      aria-label={`${scoreLabel}: ${score.value} out of 100`}
    >
      <span className="score-ring-inner"><strong>{score.value}</strong><small>/100</small></span>
    </div>
  )
}

type ScoreCardProps = { name: string; url?: string; score: SiteScore }

export function ScoreCard({ name, url, score }: ScoreCardProps) {
  return (
    <article className="score-card">
      <div className="score-card-head">
        <ScoreRing score={score} />
        <div className="score-card-copy">
          <span className="score-kicker">{scoreLabel.toUpperCase()}</span>
          <strong>{name}</strong>
          {url && <span className="score-url">{url.replace(/^https?:\/\//, '')}</span>}
          <span className={`score-band score-${score.band}`}>{bandText[score.band]}</span>
        </div>
      </div>

      {score.limitedEvidence && (
        <p className="evidence-warning"><CircleAlert size={13} /> The page looks JavaScript-rendered or was cut at the size limit, so this score may be too low.</p>
      )}

      <details className="score-breakdown" open>
        <summary>How this score was calculated · {score.earned} of {score.possible} points</summary>
        <ul>
          {score.checks.map((item) => (
            <li key={item.id} className={`check-${item.status}`}>
              <span className="check-icon"><CheckIcon status={item.status} /></span>
              <span className="check-copy">
                <strong>{item.label}</strong>
                <code>{item.detail}</code>
              </span>
              <span className="check-points">{item.status === 'skipped' ? 'n/a' : `${item.points}/${item.max}`}</span>
            </li>
          ))}
        </ul>
        <p className="score-note">
          This score covers on-page basics only. It does not measure page speed, design, rankings, backlinks or content quality. It is calculated by the server from the inspected evidence, not written by the AI.
        </p>
      </details>
    </article>
  )
}

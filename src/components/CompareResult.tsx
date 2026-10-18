import { CircleAlert, ListOrdered, Scale, Trophy } from 'lucide-react'
import type { AuditBusiness, Comparison, InspectionSummary } from '../../functions/agent/auditSchema'
import { scoreLabel, type SiteScore } from '../../functions/agent/siteScore'
import { CheckIcon, ScoreRing } from './ScoreCard'

const closeMargin = 3
const bandText = { strong: 'STRONG BASICS', fair: 'ROOM TO IMPROVE', weak: 'NEEDS WORK' } as const

type Side = { business: AuditBusiness | undefined; inspection: InspectionSummary; score: SiteScore | null }

type CompareResultProps = {
  businesses: AuditBusiness[]
  inspections: InspectionSummary[]
  comparison: Comparison | null
  model: string | null
  mode: 'live' | 'mock' | null
}

function verdict(a: Side, b: Side): { text: string; leader: 'a' | 'b' | null } {
  if (!a.score || !b.score) return { text: 'Only one site could be scored, so there is nothing to compare yet.', leader: null }
  const gap = Math.abs(a.score.value - b.score.value)
  if (gap <= closeMargin) return { text: `Too close to call: ${a.score.value} vs ${b.score.value} on the ${scoreLabel.toLowerCase()}.`, leader: null }
  const leader = a.score.value > b.score.value ? 'a' : 'b'
  const winner = leader === 'a' ? a : b
  return { text: `${winner.business?.name ?? 'One site'} leads by ${gap} points.`, leader }
}

export function CompareResult({ businesses, inspections, comparison, model, mode }: CompareResultProps) {
  const sides: Side[] = inspections.map((inspection) => ({
    inspection,
    business: businesses.find((business) => business.id === inspection.businessId),
    score: inspection.score,
  }))
  const [a, b] = sides
  if (!a || !b) return null
  const { text, leader } = verdict(a, b)
  const bothScored = Boolean(a.score && b.score)

  return (
    <div className="compare-result">
      <div className={`compare-verdict ${leader ? 'verdict-lead' : ''}`}>
        {leader ? <Trophy size={16} /> : <Scale size={16} />}
        <strong>{text}</strong>
      </div>

      <div className="compare-sites">
        {sides.map((side, index) => (
          <article className={`compare-site ${leader && (leader === 'a') === (index === 0) ? 'compare-leader' : ''}`} key={side.inspection.businessId}>
            <span className="compare-site-tag">SITE {index === 0 ? 'A' : 'B'}</span>
            {side.score ? <ScoreRing score={side.score} /> : (
              <div className="score-ring score-ring-large score-weak compare-unscored" style={{ '--score': 0 } as React.CSSProperties}>
                <span className="score-ring-inner"><strong>–</strong></span>
              </div>
            )}
            <strong className="compare-site-name">{side.business?.name ?? side.inspection.businessId}</strong>
            <span className="score-url">{side.business?.url.replace(/^https?:\/\//, '')}</span>
            {side.score
              ? <span className={`score-band score-${side.score.band}`}>{bandText[side.score.band]}</span>
              : <span className="evidence-warning"><CircleAlert size={13} /> {side.inspection.error ?? 'Could not be inspected.'}</span>}
            {side.score?.limitedEvidence && <span className="evidence-warning"><CircleAlert size={13} /> Score may be too low: the page looks JavaScript-rendered.</span>}
          </article>
        ))}
      </div>

      {bothScored && a.score && b.score && (
        <section className="compare-table-wrap" aria-labelledby="compare-table-title">
          <div className="opportunity-heading"><span id="compare-table-title">{scoreLabel.toUpperCase()} · CHECK BY CHECK</span><span>SAME CHECKS FOR BOTH</span></div>
          <table className="compare-table">
            <thead>
              <tr>
                <th scope="col">Check</th>
                <th scope="col">A</th>
                <th scope="col">B</th>
              </tr>
            </thead>
            <tbody>
              {a.score.checks.map((check, index) => {
                const other = b.score?.checks[index]
                if (!other) return null
                const better = check.points === other.points ? null : check.points > other.points ? 'a' : 'b'
                return (
                  <tr key={check.id}>
                    <th scope="row">
                      {check.label}
                      <small>{check.detail}{other.detail !== check.detail ? ` · ${other.detail}` : ''}</small>
                    </th>
                    {([['a', check], ['b', other]] as const).map(([side, item]) => (
                      <td key={side} className={`cell-${item.status} ${better === side ? 'cell-better' : ''}`}>
                        <span className="cell-content">
                          <CheckIcon status={item.status} />
                          <span>{item.status === 'skipped' ? 'n/a' : `${item.points}/${item.max}`}</span>
                        </span>
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td className={a.score.value > b.score.value ? 'cell-better' : ''}>{a.score.value}/100</td>
                <td className={b.score.value > a.score.value ? 'cell-better' : ''}>{b.score.value}/100</td>
              </tr>
            </tfoot>
          </table>
          <p className="score-note">Scores are calculated by the server from the inspected evidence, using the same checks for both sites. They cover on-page basics only, not speed, design, rankings or content quality.</p>
        </section>
      )}

      {comparison ? (
        <section className="compare-ai" aria-labelledby="compare-ai-title">
          <div className="opportunity-heading"><span id="compare-ai-title">AI COMPARISON</span><span>{mode === 'mock' ? 'LOCAL MOCK · NO AI' : (model ?? 'MODEL').toUpperCase()}</span></div>
          <p className="compare-summary">{comparison.summary}</p>
          <ul className="difference-list">
            {comparison.differences.map((difference, index) => (
              <li key={`${difference.aspect}-${index}`}>
                <strong>{difference.aspect}</strong>
                <div className="difference-sides">
                  <div><span>A</span><code>{difference.siteA}</code></div>
                  <div><span>B</span><code>{difference.siteB}</code></div>
                </div>
                <p>{difference.takeaway}</p>
              </li>
            ))}
          </ul>
          <div className="opportunity-heading"><span><ListOrdered size={11} /> WHAT THE LOWER-SCORING SITE SHOULD FIX FIRST</span></div>
          <ol className="priority-list">
            {comparison.priorities.map((priority) => <li key={priority}>{priority}</li>)}
          </ol>
        </section>
      ) : bothScored ? (
        <p className="results-disclaimer">The written comparison is not available for this run. The scores and table above are still accurate.</p>
      ) : null}
    </div>
  )
}

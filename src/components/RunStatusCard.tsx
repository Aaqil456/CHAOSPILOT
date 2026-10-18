import { Zap } from 'lucide-react'
import type { AuditRun } from '../audit/auditRun'

type RunStatusCardProps = { run: AuditRun | null }

export function RunStatusCard({ run }: RunStatusCardProps) {
  const modeLabel = run?.mode === 'mock' ? 'LOCAL MOCK · NO AI' : run?.mode === 'live' ? 'LIVE NEBIUS MODEL' : null
  return (
    <section className="run-overview panel" aria-label="Run status">
      <div className="overview-icon"><Zap size={17} fill="currentColor" /></div>
      <div className="overview-main">
        <div className="overview-title-row">
          <div className="overview-title">
            <strong>{!run ? 'Ready when you are' : run.status === 'running' ? 'Agent is working' : run.status === 'completed' ? 'Run complete' : run.status === 'cancelled' ? 'Run cancelled' : 'Run needs attention'}</strong>
            <span>{!run ? 'Each step will stream in as the server executes it.' : run.status === 'running' ? `${run.steps.filter((step) => step.status !== 'running').length} step(s) finished · model turn ${Math.max(run.turns, 1)}` : run.error ?? `${run.steps.length} tool call(s) across ${run.turns} model turn(s)${run.model ? ` · ${run.model}` : ''}`}</span>
          </div>
          <span className={`run-status status-${run?.status ?? 'idle'}`}>
            <span className="status-dot" />{!run ? 'STANDING BY' : run.status === 'running' ? 'RUNNING' : run.status === 'completed' ? 'COMPLETE' : run.status === 'cancelled' ? 'CANCELLED' : 'FAILED'}
          </span>
        </div>
        {modeLabel && <span className={`mode-badge mode-${run?.mode}`}>{modeLabel}{run?.model && run.mode === 'live' ? ` · ${run.model}` : ''}</span>}
      </div>
    </section>
  )
}

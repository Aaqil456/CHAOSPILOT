import { Check, CircleAlert, Clock3, FileCheck2, Globe2, LoaderCircle, WandSparkles } from 'lucide-react'
import type { AuditRun } from '../audit/auditRun'
import { describeStep } from '../audit/stepPresentation'

type AuditTimelineProps = { run: AuditRun | null }

function prettyJson(text: string | undefined): string {
  if (!text) return ''
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

export function AuditTimeline({ run }: AuditTimelineProps) {
  const status = run?.status
  return (
    <section className="timeline-panel panel" aria-labelledby="timeline-title">
      <div className="section-heading">
        <div className="section-title-wrap">
          <span className="section-icon timeline-icon"><WandSparkles size={15} /></span>
          <div><h2 id="timeline-title">Execution timeline</h2><p>Server-side tool calls chosen by the model</p></div>
        </div>
        {run && (
          <span className={`timeline-run-pill ${status === 'running' ? 'timeline-live' : ''}`}>
            <span />{status === 'running' ? `RUNNING · TURN ${Math.max(run.turns, 1)}` : status === 'completed' ? `COMPLETE · ${run.turns} TURNS` : status === 'error' ? 'FAILED' : 'CANCELLED'}
          </span>
        )}
      </div>

      {!run ? (
        <div className="timeline-empty">
          <span className="timeline-empty-line" />
          <Clock3 size={16} />
          <span>Each website fetch and proposal save will appear here as it happens.</span>
        </div>
      ) : (
        <div className="timeline-list" aria-live="polite">
          {run.steps.map((step) => {
            const { title, detail } = describeStep(step, run.businesses)
            const stateClass = step.status === 'completed' ? 'step-completed' : step.status === 'error' ? 'step-failed' : 'step-running'
            const Icon = step.name === 'save_proposal' ? FileCheck2 : Globe2
            return (
              <div className={`timeline-step ${stateClass}`} key={`${step.id}-${step.turn}`}>
                <div className="timeline-rail">
                  <span className="step-node">
                    {step.status === 'completed' ? <Check size={14} /> : step.status === 'error' ? <CircleAlert size={14} /> : <LoaderCircle size={14} className="spin" />}
                  </span>
                </div>
                <div className="step-content">
                  <div className="step-heading">
                    <h3><Icon size={13} /> {title}</h3>
                    <span className={`step-duration ${step.status === 'error' ? 'failed-duration' : ''}`}>
                      {step.status === 'running' ? 'RUNNING' : step.durationMs !== undefined ? `${(step.durationMs / 1000).toFixed(1)}s` : step.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="step-description">{detail}</p>
                  {step.status !== 'running' && (
                    <details className="step-raw">
                      <summary>Raw tool input and output</summary>
                      <div className="activity-card">
                        <div className="activity-card-head">
                          <span className="tool-mark"><span className="tool-mark-dot" /> {step.name} · turn {step.turn}</span>
                          <span className={step.status === 'completed' ? 'tool-ok' : 'tool-error'}>
                            {step.status === 'completed' ? <><Check size={11} /> OK</> : <><CircleAlert size={11} /> ERROR</>}
                          </span>
                        </div>
                        <pre className="step-raw-json">{`input: ${JSON.stringify(step.input, null, 2)}\n\noutput: ${prettyJson(step.output)}`}</pre>
                      </div>
                    </details>
                  )}
                </div>
              </div>
            )
          })}
          {status === 'running' && !run.steps.some((step) => step.status === 'running') && (
            <div className="timeline-step step-pending">
              <div className="timeline-rail"><span className="step-node"><LoaderCircle size={14} className="spin" /></span></div>
              <div className="step-content">
                <div className="step-heading"><h3>Model is deciding the next step</h3><span className="step-duration pending-duration">TURN {Math.max(run.turns, 1)}</span></div>
                <p className="step-description">{run.mode === 'mock' ? 'Local deterministic mock — no AI call.' : `Waiting for ${run.model ?? 'the model'} via Nebius Token Factory.`}</p>
              </div>
            </div>
          )}
          {status !== 'running' && run.steps.length === 0 && (
            <div className="timeline-empty"><span className="timeline-empty-line" /><Clock3 size={16} /><span>No tool was called in this run.</span></div>
          )}
        </div>
      )}
    </section>
  )
}

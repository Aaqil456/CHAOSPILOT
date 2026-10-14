import { Check, CircleAlert, Clock3, Globe2, WandSparkles } from 'lucide-react'
import type { AgentToolTrace, RunStatus } from '../types'

type ExecutionTimelineProps = {
  status: RunStatus
  trace: AgentToolTrace[]
}

export function ExecutionTimeline({ status, trace }: ExecutionTimelineProps) {
  const hasStarted = status !== 'idle'

  return (
    <section className="timeline-panel panel" aria-labelledby="timeline-title">
      <div className="section-heading">
        <div className="section-title-wrap">
          <span className="section-icon timeline-icon"><WandSparkles size={15} /></span>
          <div><h2 id="timeline-title">Execution trace</h2><p>Live model decisions · website requests disabled</p></div>
        </div>
        {hasStarted && (
          <span className={`timeline-run-pill ${status === 'running' ? 'timeline-live' : ''}`}>
            <span />{status === 'running' ? 'RUNNING' : status === 'completed' ? 'COMPLETE' : status === 'error' ? 'FAILED' : 'CANCELLED'}
          </span>
        )}
      </div>
      {!hasStarted ? (
        <div className="timeline-empty">
          <span className="timeline-empty-line" />
          <Clock3 size={16} />
          <span>Tool calls returned by the live model will appear here.</span>
        </div>
      ) : trace.length === 0 ? (
        <div className="timeline-empty">
          <span className="timeline-empty-line" />
          <Clock3 size={16} />
          <span>{status === 'running' ? 'Waiting for the agent response.' : 'The model did not call a tool.'}</span>
        </div>
      ) : (
        <div className="timeline-list">
          {trace.map((item) => (
            <div className={`timeline-step step-${item.status === 'completed' ? 'completed' : 'failed'}`} key={item.id}>
              <div className="timeline-rail">
                <span className="step-node">
                  {item.status === 'completed' ? <Check size={14} /> : <CircleAlert size={14} />}
                </span>
              </div>
              <div className="step-content">
                <div className="step-heading">
                  <h3><Globe2 size={13} /> {item.name}</h3>
                  <span className={`step-duration ${item.status === 'completed' ? '' : 'failed-duration'}`}>
                    {item.status === 'completed' ? 'MOCK RESULT' : 'ERROR'}
                  </span>
                </div>
                <p className="step-description">No external website request was made.</p>
                <div className={`activity-card ${item.status === 'error' ? 'activity-failed' : ''}`}>
                  <div className="activity-card-head">
                    <span className="tool-mark"><span className="tool-mark-dot" /> MOCK TOOL</span>
                    <span className={item.status === 'completed' ? 'tool-ok' : 'tool-error'}>
                      {item.status === 'completed' ? <><Check size={11} /> OK</> : <><CircleAlert size={11} /> ERROR</>}
                    </span>
                  </div>
                  <div className="activity-output"><span className="output-chevron">›</span>Input: {JSON.stringify(item.input)}</div>
                  <div className="activity-output"><span className="output-chevron">›</span>{item.output}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

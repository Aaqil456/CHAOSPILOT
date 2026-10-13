import { Check, CircleAlert, Clock3, FileText, Globe2, LoaderCircle, ScanSearch, WandSparkles } from 'lucide-react'
import { executionSteps } from '../mockData'
import type { Business, RunStatus } from '../types'

type ExecutionTimelineProps = {
  status: RunStatus
  completedSteps: number
  failedStepIndex: number | null
  businesses: Business[]
}

const stepIcons = [WandSparkles, Globe2, ScanSearch, FileText]

export function ExecutionTimeline({ status, completedSteps, failedStepIndex, businesses }: ExecutionTimelineProps) {
  const hasStarted = status !== 'idle'

  return (
    <section className="timeline-panel panel" aria-labelledby="timeline-title">
      <div className="section-heading">
        <div className="section-title-wrap">
          <span className="section-icon timeline-icon"><ActivityMark /></span>
          <div><h2 id="timeline-title">Demo timeline</h2><p>Simulated progress · no external tools called</p></div>
        </div>
        {hasStarted && <span className={`timeline-run-pill ${status === 'running' ? 'timeline-live' : ''}`}><span />{status === 'running' ? 'SIMULATING' : status === 'completed' ? 'COMPLETE' : status === 'error' ? 'FAILED' : 'CANCELLED'}</span>}
      </div>
      {!hasStarted ? (
        <div className="timeline-empty">
          <span className="timeline-empty-line" />
          <Clock3 size={16} />
          <span>Execution steps will appear here once you start a mission.</span>
        </div>
      ) : (
        <div className="timeline-list">
          {executionSteps.map((step, index) => {
            const failed = failedStepIndex === index
            const complete = index < completedSteps
            const running = status === 'running' && index === completedSteps
            const pending = !failed && !complete && !running
            const StepIcon = stepIcons[index]
            const stepStatus = failed ? 'failed' : complete ? 'completed' : running ? 'running' : 'pending'
            const output = index === 0
              ? `Demo only · ${businesses.length} ${businesses.length === 1 ? 'business' : 'businesses'} entered · no AI request made`
              : step.output

            return (
              <div className={`timeline-step step-${stepStatus}`} key={step.id}>
                <div className="timeline-rail">
                  <span className="step-node">
                    {failed ? <CircleAlert size={14} /> : complete ? <Check size={14} /> : running ? <LoaderCircle size={15} className="spin" /> : <StepIcon size={14} />}
                  </span>
                  {index < executionSteps.length - 1 && <span className={`timeline-connector ${complete ? 'connector-done' : ''}`} />}
                </div>
                <div className="step-content">
                  <div className="step-heading">
                    <h3>{step.title}</h3>
                    {complete && <span className="step-duration"><Check size={11} /> DONE</span>}
                    {running && <span className="step-duration active-duration">IN PROGRESS</span>}
                    {failed && <span className="step-duration failed-duration">FAILED</span>}
                    {pending && <span className="step-duration pending-duration">QUEUED</span>}
                  </div>
                  <p className="step-description">{step.description}</p>
                  {(complete || running || failed) && (
                    <div className={`activity-card ${failed ? 'activity-failed' : ''}`}>
                      <div className="activity-card-head">
                        <span className="tool-mark"><span className="tool-mark-dot" /> SIMULATED STEP</span>
                        {complete && <span className="tool-ok"><Check size={11} /> OK</span>}
                        {running && <span className="tool-running"><span /> RUNNING</span>}
                        {failed && <span className="tool-error"><CircleAlert size={11} /> ERROR</span>}
                      </div>
                      <div className="activity-output"><span className="output-chevron">›</span>{failed ? 'Simulated failure only · no website connection was attempted.' : output}</div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function ActivityMark() {
  return <WandSparkles size={15} />
}

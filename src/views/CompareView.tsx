import { useEffect, useRef, useState } from 'react'
import { Bot, CircleAlert, FileText, Scale, Search, TriangleAlert } from 'lucide-react'
import { compareRequestSchema } from '../../functions/agent/auditSchema'
import { AuditTimeline } from '../components/AuditTimeline'
import { CompareResult } from '../components/CompareResult'
import { RunStatusCard } from '../components/RunStatusCard'
import { TaskComposer } from '../components/TaskComposer'
import { applyAuditEvent, createRun, finishRunningSteps, streamAudit, type AuditRun, type RunRequest } from '../audit/auditRun'
import type { Business } from '../types'

const defaultTask = 'Compare these two websites. Tell me which has stronger on-page basics and what the weaker one should fix first.'

const sampleTask: RunRequest = {
  task: defaultTask,
  businesses: [
    { name: 'Python.org', url: 'https://www.python.org' },
    { name: 'CERN First Website', url: 'https://info.cern.ch' },
  ],
}

let businessCounter = 0
function newBusiness(name = '', url = ''): Business {
  businessCounter += 1
  return { id: `compare-${businessCounter}`, name, url }
}

function runId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `compare-${Date.now()}`
}

function describeIssue(path: PropertyKey[], message: string): string {
  if (path[0] === 'businesses' && typeof path[1] === 'number') {
    const field = path[2] === 'url' ? 'URL' : path[2] === 'name' ? 'name' : 'details'
    return `Website ${path[1] + 1} ${field}: ${message}`
  }
  if (path[0] === 'task') return 'Describe what to compare (up to 2,000 characters).'
  return message
}

export function CompareView() {
  const [task, setTask] = useState(defaultTask)
  const [businesses, setBusinesses] = useState<Business[]>(() => [newBusiness(), newBusiness()])
  const [formError, setFormError] = useState('')
  const [run, setRun] = useState<AuditRun | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => controllerRef.current?.abort(), [])

  const isBusy = run?.status === 'running'

  function setInputs(request: RunRequest) {
    setTask(request.task)
    setBusinesses(request.businesses.map((business) => newBusiness(business.name, business.url)))
    setFormError('')
  }

  async function start(request?: RunRequest) {
    if (isBusy) return
    let compareRequest = request
    if (!compareRequest) {
      const parsed = compareRequestSchema.safeParse({
        task,
        businesses: businesses.map((business) => ({ name: business.name, url: business.url })),
      })
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        setFormError(describeIssue(issue?.path ?? [], issue?.message ?? 'Check the task and both websites.'))
        return
      }
      compareRequest = parsed.data
    }

    setFormError('')
    const controller = new AbortController()
    controllerRef.current = controller
    let current = createRun(compareRequest, runId(), new Date().toISOString())
    setRun(current)

    try {
      await streamAudit(compareRequest, {
        endpoint: '/api/compare',
        signal: controller.signal,
        onEvent: (event) => {
          current = applyAuditEvent(current, event)
          setRun(current)
        },
      })
    } catch (error) {
      if (controller.signal.aborted) {
        current = { ...finishRunningSteps(current, 'Cancelled.'), status: 'cancelled', error: 'You cancelled the run. Completed steps are kept below.' }
      } else {
        current = {
          ...finishRunningSteps(current, 'Stopped because the run failed.'),
          status: 'error',
          error: error instanceof Error ? error.message : 'The comparison failed unexpectedly.',
        }
      }
      setRun(current)
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }

  const result = run?.result

  return (
    <div className="page-content">
      <section className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> CHAOSPILOT · WEBSITE COMPARISON</div>
          <h1>Compare two websites<span className="heading-period">.</span></h1>
          <p>Enter two websites. The agent inspects both homepages on the server, scores them with the same checks, and explains where one is ahead.</p>
        </div>
      </section>

      <div className="dashboard-grid">
        <div className="left-column">
          <TaskComposer
            title="Your comparison"
            subtitle="Two websites, scored the same way"
            taskLabel="WHAT SHOULD IT FOCUS ON?"
            taskPlaceholder="What would you like to know?"
            websitesHeading="WEBSITES TO COMPARE"
            namePlaceholders={['Your website', 'Competitor']}
            hint="Live runs call the configured NVIDIA model through Nebius and may use credits. Only each homepage is fetched, so both sites are judged on the same page type. Nothing is sent to either business."
            task={task}
            businesses={businesses}
            isBusy={isBusy}
            hasRun={Boolean(run)}
            formError={formError}
            onTaskChange={(value) => { setTask(value); setFormError('') }}
            onBusinessChange={(id, updates) => {
              setBusinesses((current) => current.map((business) => business.id === id ? { ...business, ...updates } : business))
              setFormError('')
            }}
            onStart={() => void start()}
            onCancel={() => controllerRef.current?.abort()}
            onLoadSample={() => setInputs(sampleTask)}
            onRetry={run ? () => { setInputs(run.request); void start(run.request) } : undefined}
          />

          <RunStatusCard run={run} />
          <AuditTimeline run={run} />
        </div>

        <section className="results-section panel" aria-labelledby="results-title">
          <div className="section-heading results-heading">
            <div className="section-title-wrap">
              <span className="section-icon results-icon"><Scale size={16} /></span>
              <div><h2 id="results-title">Comparison</h2><p>{run?.mode === 'mock' ? 'Rule-based mock text — real website fetches, no AI' : run?.model ? `Scores from the server · commentary by ${run.model}` : 'Scores and a written comparison appear here'}</p></div>
            </div>
          </div>

          <div className="results-body">
            {!run ? (
              <div className="results-state empty-state">
                <span className="empty-icon"><Search size={20} /></span>
                <strong>No comparison yet</strong>
                <p>Enter two different websites or load the sample task, then start a run. Both sites are fetched and scored with the same checks.</p>
              </div>
            ) : run.status === 'running' && !result ? (
              <div className="results-state loading-state">
                <div className="loading-orbit"><span /><span /><span /></div>
                <strong>Inspecting both websites</strong>
                <p>The scores and comparison appear once both homepages have been inspected. Follow the live timeline for each step.</p>
              </div>
            ) : !result ? (
              <div className="results-state error-state" role="alert">
                <span className="empty-icon error-empty-icon">{run.status === 'cancelled' ? <Bot size={21} /> : <CircleAlert size={21} />}</span>
                <strong>{run.status === 'cancelled' ? 'Run cancelled' : 'The run did not finish'}</strong>
                <p>{run.error}</p>
                <button type="button" className="secondary-button" onClick={() => { setInputs(run.request); void start(run.request) }}>Retry with the same inputs</button>
              </div>
            ) : (
              <div className="results-content">
                <div className="agent-summary">
                  <strong><FileText size={13} /> Agent summary</strong>
                  <p>{result.answer.replace(/\*\*|__|`/g, '')}</p>
                  {result.warnings.length > 0 && (
                    <ul className="warning-list">
                      {result.warnings.map((warning) => <li key={warning}><TriangleAlert size={12} /> {warning}</li>)}
                    </ul>
                  )}
                </div>
                <CompareResult
                  businesses={run.businesses}
                  inspections={result.inspections}
                  comparison={result.comparison}
                  model={run.model}
                  mode={run.mode}
                />
              </div>
            )}
          </div>
        </section>
      </div>
      <footer className="page-footer"><span>CHAOSPILOT <span className="footer-dot">·</span> WEBSITE COMPARISON</span><span>NVIDIA model via Nebius <span className="footer-dot">·</span> Server-side, allowlisted tools</span></footer>
    </div>
  )
}

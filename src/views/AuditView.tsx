import { useEffect, useRef, useState } from 'react'
import { Bot, CircleAlert, FileText, History, Search, Sparkles, Trash2, TriangleAlert } from 'lucide-react'
import { auditRequestSchema, type AuditRequest, type Proposal } from '../../functions/agent/auditSchema'
import { AuditTimeline } from '../components/AuditTimeline'
import { EvidencePanel } from '../components/EvidencePanel'
import { ProposalCard } from '../components/ProposalCard'
import { RunStatusCard } from '../components/RunStatusCard'
import { ScoreCard } from '../components/ScoreCard'
import { TaskComposer } from '../components/TaskComposer'
import { loadHistory, saveHistory, upsertRun } from '../audit/auditHistory'
import { applyAuditEvent, createRun, finishRunningSteps, streamAudit, updateProposal, type AuditRun } from '../audit/auditRun'
import type { Business } from '../types'

const defaultTask = 'Review this website and find practical improvements that would help the business win more customers. Draft a short, friendly proposal.'

const sampleTask = {
  task: 'Review this website and find practical improvements that would help the organisation attract and convert more visitors. Draft a short, friendly proposal.',
  businesses: [{ name: 'Berkshire Hathaway', url: 'https://www.berkshirehathaway.com' }],
}

let businessCounter = 0
function newBusiness(name = '', url = ''): Business {
  businessCounter += 1
  return { id: `business-${businessCounter}`, name, url }
}

function runId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `run-${Date.now()}`
}

function describeIssue(path: PropertyKey[], message: string): string {
  if (path[0] === 'businesses' && typeof path[1] === 'number') {
    const field = path[2] === 'url' ? 'website URL' : path[2] === 'name' ? 'name' : 'details'
    return `Business ${field}: ${message}`
  }
  if (path[0] === 'task') return 'Describe the task (up to 2,000 characters).'
  return message
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function AuditView() {
  const [task, setTask] = useState(defaultTask)
  const [businesses, setBusinesses] = useState<Business[]>(() => [newBusiness()])
  const [formError, setFormError] = useState('')
  const [run, setRun] = useState<AuditRun | null>(null)
  const [history, setHistory] = useState<AuditRun[]>(() => loadHistory(window.localStorage))
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => controllerRef.current?.abort(), [])

  const isBusy = run?.status === 'running'

  function remember(nextRun: AuditRun) {
    setHistory((current) => {
      const next = upsertRun(current, nextRun)
      saveHistory(window.localStorage, next)
      return next
    })
  }

  function setInputs(request: AuditRequest) {
    setTask(request.task)
    setBusinesses(request.businesses.map((business) => newBusiness(business.name, business.url)))
    setFormError('')
  }

  async function start(request?: AuditRequest) {
    if (isBusy) return
    let auditRequest = request
    if (!auditRequest) {
      const parsed = auditRequestSchema.safeParse({
        task,
        businesses: businesses
          .filter((business) => business.name.trim() || business.url.trim())
          .map((business) => ({ name: business.name, url: business.url })),
      })
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        setFormError(issue?.path[0] === 'businesses' && issue.path.length === 1
          ? 'Enter the business name and its public website URL.'
          : describeIssue(issue?.path ?? [], issue?.message ?? 'Check the task and business details.'))
        return
      }
      auditRequest = parsed.data
    }

    setFormError('')
    const controller = new AbortController()
    controllerRef.current = controller
    let current = createRun(auditRequest, runId(), new Date().toISOString())
    setRun(current)

    try {
      await streamAudit(auditRequest, {
        signal: controller.signal,
        onEvent: (event) => {
          current = applyAuditEvent(current, event)
          setRun(current)
        },
      })
    } catch (error) {
      if (controller.signal.aborted) {
        current = { ...finishRunningSteps(current, 'Cancelled.'), status: 'cancelled', error: 'You cancelled the run. Completed steps are kept above.' }
      } else {
        current = {
          ...finishRunningSteps(current, 'Stopped because the run failed.'),
          status: 'error',
          error: error instanceof Error ? error.message : 'The agent run failed unexpectedly.',
        }
      }
      setRun(current)
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
    }
    remember(current)
  }

  function changeProposal(businessId: string, changes: Partial<Pick<Proposal, 'emailSubject' | 'emailBody'>>) {
    if (!run) return
    const next = updateProposal(run, businessId, changes)
    setRun(next)
    remember(next)
  }

  function clearHistory() {
    setHistory([])
    saveHistory(window.localStorage, [])
  }

  const result = run?.result
  const proposals = result?.proposals ?? []

  return (
    <div className="page-content">
      <section className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> CHAOSPILOT · WEBSITE AUDIT AGENT</div>
          <h1>Audit a website, draft a proposal<span className="heading-period">.</span></h1>
          <p>Give a business website. The agent inspects it on the server, scores the on-page basics, cites what it found, and drafts a proposal you can edit.</p>
        </div>
      </section>

      <div className="dashboard-grid">
        <div className="left-column">
          <TaskComposer
            title="Your task"
            subtitle="Describe what you want to accomplish"
            taskLabel="YOUR TASK"
            taskPlaceholder="What would you like to accomplish?"
            websitesHeading="BUSINESS WEBSITE"
            namePlaceholders={['Business name']}
            hint="Live runs call the configured NVIDIA model through Nebius and may use credits. Only the homepage and up to two same-site pages are fetched. Nothing is sent to the business."
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

          {history.length > 0 && (
            <section className="history-panel panel" aria-labelledby="history-title">
              <div className="section-heading">
                <div className="section-title-wrap">
                  <span className="section-icon"><History size={15} /></span>
                  <div><h2 id="history-title">Recent runs</h2><p>Saved in this browser only</p></div>
                </div>
                <button type="button" className="icon-text-button" onClick={clearHistory} disabled={isBusy}><Trash2 size={12} /> Clear</button>
              </div>
              <ul className="history-list">
                {history.map((entry) => (
                  <li key={entry.id}>
                    <button type="button" disabled={isBusy} className={entry.id === run?.id ? 'history-selected' : ''} onClick={() => { setRun(entry); setInputs(entry.request) }}>
                      <span className={`history-dot status-${entry.status}`} />
                      <span className="history-copy">
                        <strong>{entry.request.businesses.map((business) => business.name).join(', ')}</strong>
                        <small>{formatTime(entry.createdAt)} · {entry.mode === 'mock' ? 'mock' : entry.model ?? 'live'}{entry.result?.inspections[0]?.score ? ` · score ${entry.result.inspections[0].score.value}` : ''}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <section className="results-section panel" aria-labelledby="results-title">
          <div className="section-heading results-heading">
            <div className="section-title-wrap">
              <span className="section-icon results-icon"><Sparkles size={16} /></span>
              <div><h2 id="results-title">Results</h2><p>{run?.mode === 'mock' ? 'Rule-based mock text — real website fetches, no AI' : run?.model ? `Written by ${run.model} from inspected evidence` : 'Proposals and evidence appear here'}</p></div>
            </div>
            {result && <span className="results-count">{proposals.length} PROPOSAL{proposals.length === 1 ? '' : 'S'}</span>}
          </div>

          <div className="results-body">
            {!run ? (
              <div className="results-state empty-state">
                <span className="empty-icon"><Search size={20} /></span>
                <strong>No run yet</strong>
                <p>Enter a business website or load the sample task, then start a run. You will see every fetch and tool call as it happens.</p>
              </div>
            ) : run.status === 'running' && !result ? (
              <div className="results-state loading-state">
                <div className="loading-orbit"><span /><span /><span /></div>
                <strong>Inspecting the website</strong>
                <p>The score and proposal appear once the model has reviewed the evidence. Follow the live timeline for each step.</p>
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

                {result.inspections.map((inspection) => inspection.score && (
                  <ScoreCard
                    key={inspection.businessId}
                    name={run.businesses.find((business) => business.id === inspection.businessId)?.name ?? inspection.businessId}
                    url={run.businesses.find((business) => business.id === inspection.businessId)?.url}
                    score={inspection.score}
                  />
                ))}

                {proposals.length > 0 ? (
                  <div className="proposal-list">
                    {proposals.map((proposal, index) => (
                      <ProposalCard
                        key={proposal.businessId}
                        proposal={proposal}
                        business={run.businesses.find((business) => business.id === proposal.businessId)}
                        index={index}
                        edited={run.editedBusinessIds.includes(proposal.businessId)}
                        onChange={(changes) => changeProposal(proposal.businessId, changes)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="results-disclaimer">No proposal was saved. The agent only writes proposals for websites it inspected successfully.</p>
                )}

                <div className="opportunity-heading evidence-heading"><span>INSPECTED EVIDENCE</span><span>FROM SERVER-SIDE FETCHES</span></div>
                <EvidencePanel businesses={run.businesses} inspections={result.inspections} />
              </div>
            )}
          </div>
        </section>
      </div>
      <footer className="page-footer"><span>CHAOSPILOT <span className="footer-dot">·</span> WEBSITE AUDIT</span><span>NVIDIA model via Nebius <span className="footer-dot">·</span> Server-side, allowlisted tools</span></footer>
    </div>
  )
}

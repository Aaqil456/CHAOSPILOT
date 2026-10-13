import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Bot, CircleAlert, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { ExecutionTimeline } from './components/ExecutionTimeline'
import { ProposalCard } from './components/ProposalCard'
import { TaskComposer } from './components/TaskComposer'
import { ModelTestPanel } from './components/ModelTestPanel'
import { executionSteps, proposalDrafts } from './mockData'
import type { Business, RunStatus } from './types'
import './App.css'

function App() {
  const [businesses, setBusinesses] = useState<Business[]>([
    { id: 'business-1', name: '', url: '' },
  ])
  const [task, setTask] = useState('Suggest practical website improvements to help these businesses attract and convert more customers.')
  const [runStatus, setRunStatus] = useState<RunStatus>('idle')
  const [completedSteps, setCompletedSteps] = useState(0)
  const [failedStepIndex, setFailedStepIndex] = useState<number | null>(null)
  const [runError, setRunError] = useState('')
  const [formError, setFormError] = useState('')
  const [shouldFail, setShouldFail] = useState(false)

  useEffect(() => {
    if (runStatus !== 'running') return

    if (completedSteps >= executionSteps.length) {
      setRunStatus('completed')
      return
    }

    const timeout = window.setTimeout(() => {
      if (shouldFail && completedSteps === 1) {
        setFailedStepIndex(completedSteps)
        setRunError('This is a simulated failure preview. No website connection was attempted.')
        setRunStatus('error')
        return
      }

      setCompletedSteps((count) => count + 1)
    }, 1050)

    return () => window.clearTimeout(timeout)
  }, [completedSteps, runStatus, shouldFail])

  const progress = useMemo(() => {
    if (runStatus === 'completed') return 100
    if (runStatus === 'running') {
      return Math.min(96, Math.round(((completedSteps + 0.45) / executionSteps.length) * 100))
    }
    return 0
  }, [completedSteps, runStatus])

  const proposals = useMemo(
    () =>
      businesses.map((business, index) => ({
        ...proposalDrafts[index % proposalDrafts.length],
        business,
      })),
    [businesses],
  )

  function updateBusiness(id: string, updates: Partial<Business>) {
    setBusinesses((current) =>
      current.map((business) => (business.id === id ? { ...business, ...updates } : business)),
    )
    setFormError('')
  }

  function addBusiness() {
    if (businesses.length >= 3) return
    setBusinesses((current) => [
      ...current,
      { id: `business-${Date.now()}`, name: '', url: '' },
    ])
    setFormError('')
  }

  function removeBusiness(id: string) {
    setBusinesses((current) => current.filter((business) => business.id !== id))
    setFormError('')
  }

  function startRun() {
    if (!task.trim()) {
      setFormError('Add a task description before starting.')
      return
    }
    if (businesses.length === 0) {
      setFormError('Add at least one business website.')
      return
    }
    const invalidBusiness = businesses.find((business) => {
      if (!business.name.trim() || !business.url.trim()) return true
      try {
        const url = new URL(business.url)
        return url.protocol !== 'https:' && url.protocol !== 'http:'
      } catch {
        return true
      }
    })
    if (invalidBusiness) {
      setFormError('Give each business a name and a valid public website URL.')
      return
    }

    setFormError('')
    setRunError('')
    setFailedStepIndex(null)
    setCompletedSteps(0)
    setShouldFail(/\bsimulate error\b/i.test(task))
    setRunStatus('running')
  }

  function cancelRun() {
    setRunStatus('cancelled')
    setRunError('This demo was cancelled. Start again whenever you are ready.')
  }

  const isBusy = runStatus === 'running'

  return (
    <div className="app-shell">
      <main className="main-shell" id="mission-control">
        <div className="page-content">
          <section className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> CHAOSPILOT · WEBSITE PROPOSALS</div>
              <h1>Start with a task<span className="heading-period">.</span></h1>
              <p>Enter a task and up to three public business websites to get started.</p>
            </div>
          </section>

          <div className="dashboard-grid">
            <div className="left-column">
              <TaskComposer
                task={task}
                businesses={businesses}
                isBusy={isBusy}
                formError={formError}
                onTaskChange={(value) => { setTask(value); setFormError('') }}
                onBusinessChange={updateBusiness}
                onAddBusiness={addBusiness}
                onRemoveBusiness={removeBusiness}
                hasRun={runStatus !== 'idle'}
                onStart={startRun}
                onCancel={cancelRun}
              />
              <section className="run-overview panel" aria-label="Demo progress">
                <div className="overview-icon"><Zap size={17} fill="currentColor" /></div>
                <div className="overview-main">
                  <div className="overview-title-row">
                    <div className="overview-title">
                      <strong>{isBusy ? 'Demo is running' : runStatus === 'completed' ? 'Demo complete' : runStatus === 'error' ? 'Demo needs attention' : runStatus === 'cancelled' ? 'Demo cancelled' : 'Ready when you are'}</strong>
                      <span>{isBusy ? 'Showing simulated steps; no websites are being fetched.' : runStatus === 'completed' ? 'Example proposal drafts are ready to review.' : runStatus === 'error' ? 'The simulated run stopped before it could finish.' : runStatus === 'cancelled' ? 'The simulated run was stopped.' : 'Your task starts the one-page demo workflow.'}</span>
                    </div>
                    <span className={`run-status status-${runStatus}`}>
                      <span className="status-dot" />{runStatus === 'running' ? 'SIMULATING' : runStatus === 'completed' ? 'COMPLETE' : runStatus === 'error' ? 'ACTION NEEDED' : runStatus === 'cancelled' ? 'CANCELLED' : 'STANDING BY'}
                    </span>
                  </div>
                  <div className="progress-track" role="progressbar" aria-label="Demo progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                    <div className={`progress-fill ${runStatus === 'error' ? 'progress-error' : ''}`} style={{ width: `${progress}%` }} />
                  </div>
                  <div className="progress-caption">
                    <span>{runStatus === 'idle' ? 'Ready to start' : `${Math.min(completedSteps, executionSteps.length)} of ${executionSteps.length} demo steps complete`}</span>
                    <strong>{progress}%</strong>
                  </div>
                </div>
              </section>
              <ExecutionTimeline
                status={runStatus}
                completedSteps={completedSteps}
                failedStepIndex={failedStepIndex}
                businesses={businesses}
              />
              <ModelTestPanel task={task} businesses={businesses} />
            </div>

            <section className="results-section panel" aria-labelledby="results-title">
              <div className="section-heading results-heading">
                <div className="section-title-wrap">
                  <span className="section-icon results-icon"><Sparkles size={16} /></span>
                  <div><h2 id="results-title">Example results</h2><p>Editable proposal templates</p></div>
                </div>
                {runStatus === 'completed' && <span className="results-count">{proposals.length} EXAMPLES</span>}
              </div>
              <div className="results-body">
                {runStatus === 'completed' ? (
                  <div className="proposal-list">
                    <div className="results-intro"><CircleCheckIcon /> <span>Example drafts only. No websites were researched and these are not AI-generated.</span></div>
                    {proposals.map((proposal) => <ProposalCard key={proposal.business.id} proposal={proposal} />)}
                    <div className="results-disclaimer"><ShieldCheck size={14} /> Drafts are for review only. No changes were made to these websites.</div>
                  </div>
                ) : runStatus === 'running' ? (
                  <div className="results-state loading-state">
                    <div className="loading-orbit"><span /><span /><span /></div>
                    <strong>Preparing your proposals</strong>
                    <p>Watching a simulated workflow. No websites are being fetched.</p>
                    <div className="skeleton-card"><div className="skeleton-line skeleton-line-short" /><div className="skeleton-line" /><div className="skeleton-line skeleton-line-medium" /></div>
                    <div className="skeleton-card"><div className="skeleton-line skeleton-line-short" /><div className="skeleton-line" /><div className="skeleton-line skeleton-line-medium" /></div>
                  </div>
                ) : runStatus === 'error' ? (
                  <div className="results-state error-state" role="alert">
                    <span className="empty-icon error-empty-icon"><CircleAlert size={21} /></span>
                    <strong>The demo stopped early</strong>
                    <p>{runError}</p>
                    <button className="secondary-button retry-button" onClick={startRun}><RotateIcon /> Try again</button>
                  </div>
                ) : runStatus === 'cancelled' ? (
                  <div className="results-state empty-state">
                    <span className="empty-icon"><Bot size={21} /></span>
                    <strong>Demo paused</strong>
                    <p>Your inputs are saved here. Start again whenever you're ready.</p>
                  </div>
                ) : (
                  <div className="results-state empty-state">
                    <span className="empty-icon"><Sparkles size={20} /></span>
                    <strong>Your examples will appear here</strong>
                    <p>Start a demo run to see example proposal drafts. This preview does not inspect websites or generate results with AI.</p>
                    <span className="results-hint"><ArrowUpRight size={13} /> Edit example drafts after the run</span>
                  </div>
                )}
              </div>
            </section>
          </div>
          <footer className="page-footer"><span>CHAOSPILOT <span className="footer-dot">·</span> WEBSITE IMPROVEMENT IDEAS</span><span>Demo preview <span className="footer-dot">·</span> No websites are fetched</span></footer>
        </div>
      </main>
    </div>
  )
}

function CircleCheckIcon() {
  return <span className="success-check"><Sparkles size={13} /></span>
}

function RotateIcon() {
  return <span className="retry-icon"><Sparkles size={14} /></span>
}

export default App

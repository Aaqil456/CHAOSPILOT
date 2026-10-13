import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowUpRight, Bot, CircleAlert, Clock3, LayoutDashboard, Settings2, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { ExecutionTimeline } from './components/ExecutionTimeline'
import { ProposalCard } from './components/ProposalCard'
import { TaskComposer } from './components/TaskComposer'
import { demoBusinesses, executionSteps, proposalDrafts } from './mockData'
import type { Business, RunStatus } from './types'
import './App.css'

function App() {
  const [businesses, setBusinesses] = useState<Business[]>(demoBusinesses)
  const [task, setTask] = useState('Research these businesses and create a personalized website improvement proposal for each one.')
  const [runStatus, setRunStatus] = useState<RunStatus>('idle')
  const [completedSteps, setCompletedSteps] = useState(0)
  const [failedStepIndex, setFailedStepIndex] = useState<number | null>(null)
  const [runError, setRunError] = useState('')
  const [formError, setFormError] = useState('')
  const [shouldFail, setShouldFail] = useState(false)
  const [navSelection, setNavSelection] = useState('Mission control')

  useEffect(() => {
    if (runStatus !== 'running') return

    if (completedSteps >= executionSteps.length) {
      setRunStatus('completed')
      return
    }

    const timeout = window.setTimeout(() => {
      if (shouldFail && completedSteps === 1) {
        setFailedStepIndex(completedSteps)
        setRunError('The demo could not reach one of the websites. Check the URL and try the run again.')
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
      setFormError('Add a task description before starting the run.')
      return
    }
    if (businesses.length === 0) {
      setFormError('Add at least one business website to research.')
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
    setRunError('This run was cancelled. You can pick up where you left off by starting again.')
  }

  const isBusy = runStatus === 'running'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#mission-control" aria-label="ChaosPilot home">
          <span className="brand-mark"><Sparkles size={18} strokeWidth={2.2} /></span>
          <span className="brand-name">chaos<span>pilot</span></span>
        </a>

        <div className="workspace-switcher">
          <span className="workspace-avatar">S</span>
          <span className="workspace-copy"><strong>Studio workspace</strong><small>Free plan</small></span>
          <Settings2 size={15} className="workspace-settings" />
        </div>

        <div className="sidebar-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          <button
            className={`nav-item ${navSelection === 'Mission control' ? 'selected' : ''}`}
            onClick={() => setNavSelection('Mission control')}
          >
            <LayoutDashboard size={17} /><span>Mission control</span><span className="nav-indicator" />
          </button>
          <button className="nav-item" onClick={() => setNavSelection('Run history')}>
            <Clock3 size={17} /><span>Run history</span><span className="nav-count">0</span>
          </button>
          <button className="nav-item" onClick={() => setNavSelection('Activity log')}>
            <Activity size={17} /><span>Activity log</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="safe-card">
            <span className="safe-icon"><ShieldCheck size={15} /></span>
            <div><strong>Safe by design</strong><p>Demo mode · No external actions</p></div>
            <span className="safe-dot" />
          </div>
        </div>
      </aside>

      <main className="main-shell" id="mission-control">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><span className="breadcrumb-divider">/</span><strong>{navSelection}</strong></div>
          <div className="topbar-right">
            <span className="demo-badge"><span /> DEMO ENVIRONMENT</span>
            <button className="icon-button notification-button" aria-label="Activity notifications">
              <Activity size={17} /><span className="notification-dot" />
            </button>
          </div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> YOUR AI WORKSPACE</div>
              <h1>Mission control<span className="heading-period">.</span></h1>
              <p>Turn a brief into a plan. Watch every step unfold.</p>
            </div>
            <div className="heading-meta">
              <span className="live-pill"><span className="live-pulse" /> SYSTEM OPERATIONAL</span>
              <span className="heading-date">THURSDAY, OCTOBER 13</span>
            </div>
          </section>

          <section className="run-overview panel" aria-label="Run progress">
            <div className="overview-icon"><Zap size={17} fill="currentColor" /></div>
            <div className="overview-main">
              <div className="overview-title-row">
                <div className="overview-title">
                  <strong>{isBusy ? 'Agent is working' : runStatus === 'completed' ? 'Run completed' : runStatus === 'error' ? 'Run needs attention' : runStatus === 'cancelled' ? 'Run cancelled' : 'Ready for your next mission'}</strong>
                  <span>{isBusy ? 'Your websites are being researched in real time.' : runStatus === 'completed' ? 'Your proposals are ready to review.' : runStatus === 'error' ? 'The run stopped before it could finish.' : runStatus === 'cancelled' ? 'The agent stopped safely.' : 'Configure a task and let your agent take it from here.'}</span>
                </div>
                <span className={`run-status status-${runStatus}`}>
                  <span className="status-dot" />{runStatus === 'running' ? 'IN PROGRESS' : runStatus === 'completed' ? 'COMPLETED' : runStatus === 'error' ? 'ACTION NEEDED' : runStatus === 'cancelled' ? 'CANCELLED' : 'STANDING BY'}
                </span>
              </div>
              <div className="progress-track" role="progressbar" aria-label="Mission progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <div className={`progress-fill ${runStatus === 'error' ? 'progress-error' : ''}`} style={{ width: `${progress}%` }} />
              </div>
              <div className="progress-caption">
                <span>{runStatus === 'idle' ? 'Awaiting instructions' : `${Math.min(completedSteps, executionSteps.length)} of ${executionSteps.length} steps complete`}</span>
                <strong>{progress}%</strong>
              </div>
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
                onStart={startRun}
                onCancel={cancelRun}
              />
              <ExecutionTimeline
                status={runStatus}
                completedSteps={completedSteps}
                failedStepIndex={failedStepIndex}
                businesses={businesses}
              />
            </div>

            <section className="results-section panel" aria-labelledby="results-title">
              <div className="section-heading results-heading">
                <div className="section-title-wrap">
                  <span className="section-icon results-icon"><Sparkles size={16} /></span>
                  <div><h2 id="results-title">Mission results</h2><p>Your personalized proposals</p></div>
                </div>
                {runStatus === 'completed' && <span className="results-count">{proposals.length} READY</span>}
              </div>
              <div className="results-body">
                {runStatus === 'completed' ? (
                  <div className="proposal-list">
                    <div className="results-intro"><CircleCheckIcon /> <span>Research complete. Review and edit your proposals below.</span></div>
                    {proposals.map((proposal) => <ProposalCard key={proposal.business.id} proposal={proposal} />)}
                    <div className="results-disclaimer"><ShieldCheck size={14} /> Drafts are for review only. No changes were made to these websites.</div>
                  </div>
                ) : runStatus === 'running' ? (
                  <div className="results-state loading-state">
                    <div className="loading-orbit"><span /><span /><span /></div>
                    <strong>Preparing your proposals</strong>
                    <p>First, the agent is gathering context from each business website.</p>
                    <div className="skeleton-card"><div className="skeleton-line skeleton-line-short" /><div className="skeleton-line" /><div className="skeleton-line skeleton-line-medium" /></div>
                    <div className="skeleton-card"><div className="skeleton-line skeleton-line-short" /><div className="skeleton-line" /><div className="skeleton-line skeleton-line-medium" /></div>
                  </div>
                ) : runStatus === 'error' ? (
                  <div className="results-state error-state" role="alert">
                    <span className="empty-icon error-empty-icon"><CircleAlert size={21} /></span>
                    <strong>We hit a research snag</strong>
                    <p>{runError}</p>
                    <button className="secondary-button retry-button" onClick={startRun}><RotateIcon /> Try again</button>
                  </div>
                ) : runStatus === 'cancelled' ? (
                  <div className="results-state empty-state">
                    <span className="empty-icon"><Bot size={21} /></span>
                    <strong>Mission paused</strong>
                    <p>Your inputs are saved here. Start again whenever you're ready.</p>
                  </div>
                ) : (
                  <div className="results-state empty-state">
                    <span className="empty-icon"><Sparkles size={20} /></span>
                    <strong>Your results will land here</strong>
                    <p>Start a mission to see tailored website proposals, backed by the agent's research.</p>
                    <span className="results-hint"><ArrowUpRight size={13} /> Proposals are editable after the run</span>
                  </div>
                )}
              </div>
            </section>
          </div>
          <footer className="page-footer"><span>CHAOSPILOT <span className="footer-dot">·</span> MISSION CONTROL</span><span>Demo mode <span className="footer-dot">·</span> All activity is simulated</span></footer>
        </div>
      </main>
    </div>
  )
}

function CircleCheckIcon() {
  return <span className="success-check"><Sparkles size={13} /></span>
}

function RotateIcon() {
  return <span className="retry-icon"><Activity size={14} /></span>
}

export default App

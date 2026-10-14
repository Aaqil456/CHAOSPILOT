import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Bot, CircleAlert, Sparkles, Zap } from 'lucide-react'
import { ExecutionTimeline } from './components/ExecutionTimeline'
import { TaskComposer } from './components/TaskComposer'
import { ModelTestPanel } from './components/ModelTestPanel'
import type { AgentRunResponse, Business, RunStatus } from './types'
import './App.css'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isAgentRunResponse(value: unknown): value is AgentRunResponse {
  return isRecord(value)
    && value.mode === 'live'
    && value.agentName === 'Website Growth Agent'
    && value.liveModel === true
    && value.liveWebsiteFetch === false
    && typeof value.model === 'string'
    && typeof value.answer === 'string'
    && Array.isArray(value.trace)
    && Array.isArray(value.activatedSkills)
    && value.activatedSkills.every((skill) => typeof skill === 'string')
    && typeof value.turns === 'number'
    && (value.stopReason === 'final' || value.stopReason === 'turn_limit' || value.stopReason === 'tool_call_limit')
    && value.trace.every((item) =>
      isRecord(item)
      && typeof item.id === 'string'
      && typeof item.name === 'string'
      && typeof item.output === 'string'
      && (item.status === 'completed' || item.status === 'error'),
    )
}

function App() {
  const [businesses, setBusinesses] = useState<Business[]>([
    { id: 'business-1', name: '', url: '' },
  ])
  const [task, setTask] = useState('Suggest practical website improvements to help these businesses attract and convert more customers.')
  const [runStatus, setRunStatus] = useState<RunStatus>('idle')
  const [runResult, setRunResult] = useState<AgentRunResponse | null>(null)
  const [runError, setRunError] = useState('')
  const [formError, setFormError] = useState('')
  const requestController = useRef<AbortController | null>(null)

  useEffect(() => () => requestController.current?.abort(), [])

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

  async function startRun() {
    if (!task.trim()) {
      setFormError('Add a task description before starting.')
      return
    }

    const submittedBusinesses = businesses.filter(
      (business) => business.name.trim() || business.url.trim(),
    )
    const invalidBusiness = submittedBusinesses.find((business) => {
      if (!business.name.trim() || !business.url.trim()) return true
      try {
        const url = new URL(business.url)
        return (url.protocol !== 'https:' && url.protocol !== 'http:')
          || Boolean(url.username || url.password)
      } catch {
        return true
      }
    })
    if (invalidBusiness) {
      setFormError('Give each submitted business a name and a valid HTTP(S) website URL.')
      return
    }

    setFormError('')
    setRunError('')
    setRunResult(null)
    setRunStatus('running')
    const controller = new AbortController()
    requestController.current = controller

    try {
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: task.trim(),
          businesses: submittedBusinesses.map(({ id, name, url }) => ({
            id,
            name: name.trim(),
            url: url.trim(),
          })),
        }),
        signal: controller.signal,
      })
      let body: unknown
      try {
        body = await response.json()
      } catch {
        throw new Error('The run endpoint returned invalid JSON.')
      }

      if (!response.ok) {
        const message = isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string'
          ? body.error.message
          : 'The agent run failed.'
        throw new Error(message)
      }
      if (!isAgentRunResponse(body)) {
        throw new Error('The run endpoint returned an invalid response.')
      }

      setRunResult(body)
      setRunStatus('completed')
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setRunStatus('cancelled')
        setRunError('The request was cancelled. No progress or tool calls are shown unless returned by the server.')
      } else {
        setRunStatus('error')
        setRunError(error instanceof Error ? error.message : 'The agent run failed unexpectedly.')
      }
    } finally {
      if (requestController.current === controller) requestController.current = null
    }
  }

  function cancelRun() {
    requestController.current?.abort()
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
              <section className="run-overview panel" aria-label="Run status">
                <div className="overview-icon"><Zap size={17} fill="currentColor" /></div>
                <div className="overview-main">
                  <div className="overview-title-row">
                    <div className="overview-title">
                      <strong>{isBusy ? 'Website Growth Agent is running' : runStatus === 'completed' ? 'Agent run complete' : runStatus === 'error' ? 'Run needs attention' : runStatus === 'cancelled' ? 'Run cancelled' : 'Ready when you are'}</strong>
                      <span>{isBusy ? 'Waiting for the bounded Nebius agent loop to return.' : runStatus === 'completed' ? 'The answer and trace below came from the live model and registered tools.' : runStatus === 'error' ? 'The run failed before a valid result was returned.' : runStatus === 'cancelled' ? 'The run request was cancelled.' : 'Starting a run calls the configured Nebius model. No website is fetched.'}</span>
                    </div>
                    <span className={`run-status status-${runStatus}`}>
                      <span className="status-dot" />{runStatus === 'running' ? 'LIVE MODEL RUNNING' : runStatus === 'completed' ? 'LIVE MODEL COMPLETE' : runStatus === 'error' ? 'ACTION NEEDED' : runStatus === 'cancelled' ? 'CANCELLED' : 'STANDING BY'}
                    </span>
                  </div>
                </div>
              </section>
              <ExecutionTimeline
                status={runStatus}
                trace={runResult?.trace ?? []}
              />
              <ModelTestPanel task={task} businesses={businesses} />
            </div>

            <section className="results-section panel" aria-labelledby="results-title">
              <div className="section-heading results-heading">
                <div className="section-title-wrap">
                  <span className="section-icon results-icon"><Sparkles size={16} /></span>
                  <div><h2 id="results-title">Website Growth Agent</h2><p>{runResult ? `Nebius · ${runResult.model}` : 'Live Nebius model · website fetching disabled'}</p></div>
                </div>
                {runResult && <span className="results-count">{runResult.turns} MODEL TURNS</span>}
              </div>
              <div className="results-body">
                {runStatus === 'completed' && runResult ? (
                  <div className="results-state agent-answer">
                    <strong>Agent response</strong>
                    <p>{runResult.answer}</p>
                    <small>Live model request completed. No website was fetched. A run may make multiple model requests and use Nebius credits.</small>
                    {runResult.activatedSkills.length > 0 && (
                      <div className="agent-skills">
                        <strong>Loaded skill instructions</strong>
                        <ul>{runResult.activatedSkills.map((skill) => <li key={skill}>{skill}</li>)}</ul>
                      </div>
                    )}
                  </div>
                ) : runStatus === 'running' ? (
                  <div className="results-state loading-state">
                    <div className="loading-orbit"><span /><span /><span /></div>
                    <strong>Waiting for the agent response</strong>
                    <p>No progress percentage is available; tool calls appear only after the server returns the completed run.</p>
                  </div>
                ) : runStatus === 'error' ? (
                  <div className="results-state error-state" role="alert">
                    <span className="empty-icon error-empty-icon"><CircleAlert size={21} /></span>
                    <strong>The run failed</strong>
                    <p>{runError}</p>
                    <button className="secondary-button retry-button" onClick={() => void startRun()}><RotateIcon /> Try again</button>
                  </div>
                ) : runStatus === 'cancelled' ? (
                  <div className="results-state empty-state">
                    <span className="empty-icon"><Bot size={21} /></span>
                    <strong>Run cancelled</strong>
                    <p>{runError}</p>
                  </div>
                ) : (
                  <div className="results-state empty-state">
                    <span className="empty-icon"><Sparkles size={20} /></span>
                    <strong>Your response will appear here</strong>
                    <p>Starting a task uses the configured Nebius model. Website fetching is disabled; the only registered website tool returns a mock result.</p>
                    <span className="results-hint"><ArrowUpRight size={13} /> Live inference may use Nebius credits</span>
                  </div>
                )}
              </div>
            </section>
          </div>
          <footer className="page-footer"><span>CHAOSPILOT <span className="footer-dot">·</span> WEBSITE IMPROVEMENT IDEAS</span><span>Live Nebius model <span className="footer-dot">·</span> Website fetching disabled</span></footer>
        </div>
      </main>
    </div>
  )
}

function RotateIcon() {
  return <span className="retry-icon"><Sparkles size={14} /></span>
}

export default App

import { useEffect, useRef, useState } from 'react'
import { Bot, CircleAlert, Code2, Sparkles, Zap } from 'lucide-react'
import { ExecutionTimeline } from './components/ExecutionTimeline'
import { ProjectEditor } from './components/ProjectEditor'
import { WebsitePreview } from './components/WebsitePreview'
import { loadProject, saveProject } from './projectState'
import type { ProjectFilePath, ProjectFiles } from '../functions/agent/projectFiles'
import { validateProjectFiles } from '../functions/agent/projectFiles'
import type { AgentRunResponse, AgentToolTrace, RunStatus } from './types'
import './App.css'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseAgentRunResponse(value: unknown): AgentRunResponse {
  if (
    !isRecord(value)
    || (value.mode !== 'live' && value.mode !== 'mock')
    || value.agentName !== 'ChaosPilot Website Agent'
    || value.liveModel !== (value.mode === 'live')
    || typeof value.model !== 'string'
    || typeof value.answer !== 'string'
    || !Array.isArray(value.trace)
    || typeof value.turns !== 'number'
    || (value.stopReason !== 'final' && value.stopReason !== 'turn_limit' && value.stopReason !== 'tool_call_limit')
  ) {
    throw new Error('The agent returned an invalid project response.')
  }
  const trace = value.trace as AgentToolTrace[]
  if (!trace.every((item) =>
    isRecord(item)
    && typeof item.id === 'string'
    && typeof item.name === 'string'
    && typeof item.input !== 'undefined'
    && typeof item.output === 'string'
    && (item.status === 'completed' || item.status === 'error'),
  )) {
    throw new Error('The agent returned an invalid execution trace.')
  }
  return {
    mode: value.mode,
    agentName: 'ChaosPilot Website Agent',
    liveModel: value.liveModel,
    model: value.model,
    answer: value.answer,
    files: validateProjectFiles(value.files),
    trace,
    turns: value.turns,
    stopReason: value.stopReason,
  }
}

function App() {
  const [initialProject] = useState(() => {
    try {
      return { project: loadProject(window.localStorage), error: '' }
    } catch (error) {
      return {
        project: { task: '', files: {} as ProjectFiles },
        error: error instanceof Error ? error.message : 'Could not read saved project.',
      }
    }
  })
  const [task, setTask] = useState(initialProject.project.task)
  const [files, setFiles] = useState<ProjectFiles>(initialProject.project.files)
  const [selectedFile, setSelectedFile] = useState<ProjectFilePath>('index.html')
  const [persistenceError, setPersistenceError] = useState(initialProject.error)
  const [runStatus, setRunStatus] = useState<RunStatus>('idle')
  const [runResult, setRunResult] = useState<AgentRunResponse | null>(null)
  const [runError, setRunError] = useState('')
  const currentController = useRef<AbortController | null>(null)
  const [activeController, setActiveController] = useState<AbortController | null>(null)

  function persistProject(nextTask: string, nextFiles: ProjectFiles) {
    try {
      saveProject(window.localStorage, { task: nextTask, files: nextFiles })
      setPersistenceError('')
    } catch (error) {
      setPersistenceError(error instanceof Error ? error.message : 'Browser storage is unavailable.')
    }
  }

  useEffect(() => () => currentController.current?.abort(), [])

  function updateTask(value: string) {
    setTask(value)
    persistProject(value, files)
    if (!isBusy) {
      setRunResult(null)
      setRunStatus('idle')
    }
  }

  async function startRun() {
    if (!task.trim()) {
      setRunError('Describe the website you want to generate.')
      return
    }

    setRunError('')
    setRunResult(null)
    setRunStatus('running')
    const controller = new AbortController()
    currentController.current = controller
    setActiveController(controller)

    try {
      const requestBody = JSON.stringify({ task: task.trim(), files })
      if (new TextEncoder().encode(requestBody).byteLength > 512 * 1024) {
        throw new Error('The project request exceeds the 512 KB limit.')
      }
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
        signal: controller.signal,
      })
      let body: unknown
      try {
        body = await response.json()
      } catch {
        throw new Error('The agent endpoint returned invalid JSON.')
      }

      if (!response.ok) {
        const message = isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string'
          ? body.error.message
          : 'The website generation run failed.'
        throw new Error(message)
      }
      const result = parseAgentRunResponse(body)
      setFiles(result.files)
      persistProject(task, result.files)
      setRunResult(result)
      setRunStatus('completed')
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setRunStatus('cancelled')
        setRunError('The request was cancelled. The saved project was left unchanged.')
      } else {
        setRunStatus('error')
        setRunError(error instanceof Error ? error.message : 'The agent run failed unexpectedly.')
      }
    } finally {
      if (currentController.current === controller) currentController.current = null
      setActiveController((current) => current === controller ? null : current)
    }
  }

  const isBusy = runStatus === 'running'
  const hasGeneratedSite = Boolean(files['index.html'])
  const completedOperations = runResult?.trace.filter((item) => item.status === 'completed').length ?? 0

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Workspace navigation">
        <a className="brand" href="#workspace">
          <span className="brand-mark"><Bot size={16} /></span>
          <span className="brand-name">CHAOS<span>PILOT</span></span>
        </a>
        <div className="workspace-switcher">
          <span className="workspace-avatar"><Code2 size={15} /></span>
          <span className="workspace-copy"><strong>Website workspace</strong><small>Local project</small></span>
        </div>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="side-nav">
          <a className="nav-item selected" href="#workspace"><Code2 size={15} /> Website builder<span className="nav-indicator" /></a>
        </nav>
        <div className="sidebar-bottom">
          <div className="safe-card">
            <span className="safe-icon"><Zap size={14} /></span>
            <div><strong>Sandboxed preview</strong><p>Generated code isolated</p></div>
            <span className="safe-dot" />
          </div>
        </div>
      </aside>

      <main className="main-shell" id="workspace">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><span className="breadcrumb-divider">/</span><strong>Website builder</strong></div>
          <div className="topbar-right"><span className="demo-badge"><span /> LOCAL PROJECT</span></div>
        </header>
        <div className="page-content">
          <section className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> CHAOSPILOT · WEBSITE DEVELOPMENT AGENT</div>
              <h1>Build a website<span className="heading-period">.</span></h1>
              <p>Describe what you want. Generate a site, preview it, and keep your project in this browser.</p>
            </div>
          </section>

          <section className="run-overview panel" aria-label="Project run status">
            <div className="overview-icon"><Zap size={17} fill="currentColor" /></div>
            <div className="overview-main">
              <div className="overview-title-row">
                <div className="overview-title">
                  <strong>{isBusy ? 'Website agent is working' : runStatus === 'completed' ? 'Website generated' : runStatus === 'error' ? 'Run needs attention' : runStatus === 'cancelled' ? 'Run cancelled' : hasGeneratedSite ? 'Saved website ready' : 'Ready to build'}</strong>
                  <span>{isBusy ? 'The agent is generating files in a request-scoped project.' : runStatus === 'completed' ? runResult?.answer : runStatus === 'error' ? runError : runStatus === 'cancelled' ? 'The run request was cancelled.' : hasGeneratedSite ? 'Your project and preview were restored from browser storage.' : 'Your prompt and project files stay in this browser.'}</span>
                </div>
                <span className={`run-status status-${runStatus}`}><span className="status-dot" />{runStatus === 'running' ? 'AGENT RUNNING' : runStatus === 'completed' ? 'COMPLETE' : runStatus === 'error' ? 'ACTION NEEDED' : runStatus === 'cancelled' ? 'CANCELLED' : hasGeneratedSite ? 'PROJECT SAVED' : 'STANDING BY'}</span>
              </div>
            </div>
          </section>

          <div className="builder-grid">
            <ProjectEditor
              task={task}
              files={files}
              selectedFile={selectedFile}
              status={runStatus}
              error={runError}
              persistenceError={persistenceError}
              onTaskChange={updateTask}
              onFileSelect={setSelectedFile}
              onStart={() => void startRun()}
              onCancel={() => activeController?.abort()}
            />
            <div className="builder-right">
              <WebsitePreview files={files} />
              <section className="timeline-panel panel">
                <div className="section-heading">
                  <div className="section-title-wrap">
                    <span className="section-icon timeline-icon"><Sparkles size={15} /></span>
                    <div><h2>Execution trace</h2><p>Real project operations returned by the agent</p></div>
                  </div>
                  {runResult && <span className="results-count">{runResult.turns} MODEL TURNS</span>}
                </div>
                <ExecutionTimeline status={runStatus} trace={runResult?.trace ?? []} />
                {runResult && (
                  <div className="agent-result-note">
                    <strong>Agent response</strong>
                    <p>{runResult.answer}</p>
                    <small>{completedOperations} successful file operation{completedOperations === 1 ? '' : 's'} · {runResult.liveModel ? `Nebius model: ${runResult.model}` : 'Local deterministic mock; no AI called.'}</small>
                  </div>
                )}
                {runStatus === 'error' && <p className="timeline-error" role="alert"><CircleAlert size={13} /> {runError}</p>}
              </section>
            </div>
          </div>
          <footer className="page-footer"><span>CHAOSPILOT <span className="footer-dot">·</span> WEBSITE BUILDER</span><span>Browser-local project <span className="footer-dot">·</span> Sandbox preview</span></footer>
        </div>
      </main>
    </div>
  )
}

export default App

import { CircleAlert, Code2, FileCode2, LoaderCircle, Rocket } from 'lucide-react'
import { projectFilePaths } from '../../functions/agent/projectFiles'
import type { ProjectFilePath, ProjectFiles } from '../../functions/agent/projectFiles'
import type { RunStatus } from '../types'

type ProjectEditorProps = {
  task: string
  files: ProjectFiles
  selectedFile: ProjectFilePath
  status: RunStatus
  error: string
  persistenceError: string
  onTaskChange: (task: string) => void
  onFileSelect: (path: ProjectFilePath) => void
  onStart: () => void
  onCancel: () => void
}

export function ProjectEditor({
  task,
  files,
  selectedFile,
  status,
  error,
  persistenceError,
  onTaskChange,
  onFileSelect,
  onStart,
  onCancel,
}: ProjectEditorProps) {
  const isBusy = status === 'running'
  const hasGeneratedSite = Boolean(files['index.html'])
  return (
    <section className="project-editor panel" aria-labelledby="project-editor-title">
      <div className="section-heading">
        <div className="section-title-wrap">
          <span className="section-icon composer-icon"><Code2 size={15} /></span>
          <div><h2 id="project-editor-title">Website project</h2><p>Describe the website you want to generate</p></div>
        </div>
        <span className="sample-label"><span /> AGENT RUNTIME</span>
      </div>
      <label className="field-label" htmlFor="project-task">YOUR PROMPT</label>
      <textarea
        id="project-task"
        className="project-task-input"
        value={task}
        onChange={(event) => onTaskChange(event.target.value)}
        disabled={isBusy || hasGeneratedSite}
        rows={4}
        maxLength={2000}
        placeholder="Create a polished portfolio website for a ceramic artist..."
      />
      <div className="project-actions">
        <span className="privacy-note"><Code2 size={13} /> HTML · CSS · JavaScript · local project</span>
        {isBusy ? (
          <button type="button" className="cancel-button" onClick={onCancel}><span className="cancel-square" /> Cancel</button>
        ) : (
          <button type="button" className="start-button" onClick={onStart} disabled={hasGeneratedSite}>
            <Rocket size={15} /> {hasGeneratedSite ? 'Website generated' : 'Generate website'} {!hasGeneratedSite && <span className="button-arrow">↗</span>}
          </button>
        )}
      </div>
      {error && <div className="form-error" role="alert"><CircleAlert size={15} />{error}</div>}
      {persistenceError && <div className="form-error" role="alert"><CircleAlert size={15} />Project could not be saved in this browser: {persistenceError}</div>}
      <div className="project-file-heading">
        <div><strong>Project files</strong><span>Changes are saved in this browser</span></div>
        <span className="project-file-count">{Object.keys(files).length}/3</span>
      </div>
      <div className="project-file-tabs" role="tablist" aria-label="Project files">
        {projectFilePaths.map((path) => (
          <button
            type="button"
            role="tab"
            aria-selected={selectedFile === path}
            className={selectedFile === path ? 'project-file-tab selected' : 'project-file-tab'}
            key={path}
            disabled={isBusy}
            onClick={() => onFileSelect(path)}
          >
            <FileCode2 size={13} /> {path}
          </button>
        ))}
      </div>
      <label className="visually-hidden" htmlFor="project-file-content">{selectedFile} content</label>
      <textarea
        id="project-file-content"
        className="project-code-editor"
        value={files[selectedFile] ?? ''}
        readOnly
        disabled={isBusy}
        spellCheck={false}
        aria-label={`${selectedFile} source`}
      />
      {hasGeneratedSite && <p className="project-stage-note">Follow-up editing will be enabled in the next milestone. This project is preserved as-is.</p>}
      {isBusy && <div className="project-running"><LoaderCircle size={14} /> Agent is generating the request-scoped project…</div>}
    </section>
  )
}

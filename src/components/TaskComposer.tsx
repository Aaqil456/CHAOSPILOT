import { CircleAlert, FlaskConical, Globe2, LoaderCircle, Rocket, RotateCcw } from 'lucide-react'
import type { Business } from '../types'

type TaskComposerProps = {
  title: string
  subtitle: string
  taskLabel: string
  taskPlaceholder: string
  /** Heading above the website fields, for example "WEBSITE" or "WEBSITES TO COMPARE". */
  websitesHeading: string
  /** Placeholder for each business name field; its length does not change the number of fields. */
  namePlaceholders: string[]
  hint: string
  task: string
  businesses: Business[]
  isBusy: boolean
  hasRun: boolean
  formError: string
  onTaskChange: (task: string) => void
  onBusinessChange: (id: string, updates: Partial<Business>) => void
  onStart: () => void
  onCancel: () => void
  onLoadSample: () => void
  onRetry?: () => void
}

export function TaskComposer({
  title,
  subtitle,
  taskLabel,
  taskPlaceholder,
  websitesHeading,
  namePlaceholders,
  hint,
  task,
  businesses,
  isBusy,
  hasRun,
  formError,
  onTaskChange,
  onBusinessChange,
  onStart,
  onCancel,
  onLoadSample,
  onRetry,
}: TaskComposerProps) {
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onStart()
  }

  return (
    <section className="composer-panel panel" aria-labelledby="composer-title">
      <div className="section-heading">
        <div className="section-title-wrap">
          <span className="section-icon composer-icon"><Rocket size={15} /></span>
          <div><h2 id="composer-title">{title}</h2><p>{subtitle}</p></div>
        </div>
        <button type="button" className="sample-button" onClick={onLoadSample} disabled={isBusy}>
          <FlaskConical size={13} /> Load sample task
        </button>
      </div>

      <form className="composer-form" onSubmit={submit}>
        <label className="field-label" htmlFor="task-input">{taskLabel}</label>
        <div className="task-input-wrap">
          <SparkleMark />
          <textarea
            id="task-input"
            value={task}
            onChange={(event) => onTaskChange(event.target.value)}
            rows={3}
            disabled={isBusy}
            placeholder={taskPlaceholder}
          />
          <span className="task-input-hint">Be specific for better results</span>
        </div>

        <div className="business-field-heading">
          <span className="field-label">{websitesHeading}</span>
        </div>
        <div className="business-list">
          {businesses.map((business, index) => (
            <div className="business-input-row" key={business.id}>
              <span className={`business-number business-number-${index + 1}`}>{String(index + 1).padStart(2, '0')}</span>
              <label className="visually-hidden" htmlFor={`${business.id}-name`}>Website {index + 1} name</label>
              <input
                id={`${business.id}-name`}
                value={business.name}
                onChange={(event) => onBusinessChange(business.id, { name: event.target.value })}
                disabled={isBusy}
                placeholder={namePlaceholders[index] ?? 'Business name'}
              />
              <span className="business-input-divider" />
              <Globe2 size={14} className="url-globe" />
              <label className="visually-hidden" htmlFor={`${business.id}-url`}>Website {index + 1} URL</label>
              <input
                id={`${business.id}-url`}
                className="url-input"
                type="url"
                value={business.url}
                onChange={(event) => onBusinessChange(business.id, { url: event.target.value })}
                disabled={isBusy}
                placeholder="https://yourbusiness.com"
              />
              <a
                className="external-link"
                href={business.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${business.name || `website ${index + 1}`} in a new tab`}
                onClick={(event) => {
                  if (!business.url) event.preventDefault()
                }}
              >
                <Globe2 size={14} />
              </a>
            </div>
          ))}
        </div>

        {formError && <div className="form-error" role="alert"><CircleAlert size={15} />{formError}</div>}
        <div className="composer-actions">
          <div className="privacy-note"><span className="privacy-icon"><Globe2 size={13} /></span><span>Public HTTP(S) sites <span className="note-separator">·</span> Fetched server-side</span></div>
          {isBusy ? (
            <button type="button" className="cancel-button" onClick={onCancel}><span className="cancel-square" /> Cancel run</button>
          ) : (
            <div className="composer-buttons">
              {hasRun && onRetry && (
                <button type="button" className="secondary-button" onClick={onRetry}><RotateCcw size={13} /> Retry</button>
              )}
              <button type="submit" className="start-button">
                <Rocket size={15} /> {hasRun ? 'Run with these inputs' : 'Start run'} <span className="button-arrow">↗</span>
              </button>
            </div>
          )}
        </div>
        <div className="demo-error-hint">{hint}</div>
      </form>
    </section>
  )
}

function SparkleMark() {
  return <span className="task-sparkle"><LoaderCircle size={16} /></span>
}

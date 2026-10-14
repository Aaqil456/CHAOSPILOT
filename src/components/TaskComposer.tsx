import { CircleAlert, Globe2, LoaderCircle, Plus, Rocket, X } from 'lucide-react'
import type { Business } from '../types'

type TaskComposerProps = {
  task: string
  businesses: Business[]
  isBusy: boolean
  hasRun: boolean
  formError: string
  onTaskChange: (task: string) => void
  onBusinessChange: (id: string, updates: Partial<Business>) => void
  onAddBusiness: () => void
  onRemoveBusiness: (id: string) => void
  onStart: () => void
  onCancel: () => void
}

export function TaskComposer({
  task,
  businesses,
  isBusy,
  hasRun,
  formError,
  onTaskChange,
  onBusinessChange,
  onAddBusiness,
  onRemoveBusiness,
  onStart,
  onCancel,
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
          <div><h2 id="composer-title">Your task</h2><p>Describe what you want to accomplish</p></div>
        </div>
        <span className="sample-label"><span /> LIVE AGENT</span>
      </div>

      <form className="composer-form" onSubmit={submit}>
        <label className="field-label" htmlFor="task-input">YOUR TASK</label>
        <div className="task-input-wrap">
          <SparkleMark />
          <textarea
            id="task-input"
            value={task}
            onChange={(event) => onTaskChange(event.target.value)}
            rows={3}
            disabled={isBusy}
            placeholder="What would you like to accomplish?"
          />
          <span className="task-input-hint">Be specific for better results</span>
        </div>

        <div className="business-field-heading">
          <label className="field-label">BUSINESS WEBSITES <span className="field-count">{businesses.length}/3</span></label>
          {businesses.length < 3 && <button type="button" className="add-business-button" onClick={onAddBusiness} disabled={isBusy}><Plus size={13} /> Add business</button>}
        </div>
        <div className="business-list">
          {businesses.map((business, index) => (
            <div className="business-input-row" key={business.id}>
              <span className={`business-number business-number-${index + 1}`}>{String(index + 1).padStart(2, '0')}</span>
              <label className="visually-hidden" htmlFor={`${business.id}-name`}>Business {index + 1} name</label>
              <input
                id={`${business.id}-name`}
                value={business.name}
                onChange={(event) => onBusinessChange(business.id, { name: event.target.value })}
                disabled={isBusy}
                placeholder="Business name"
              />
              <span className="business-input-divider" />
              <Globe2 size={14} className="url-globe" />
              <label className="visually-hidden" htmlFor={`${business.id}-url`}>Business {index + 1} website URL</label>
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
                aria-label={`Open ${business.name || `business ${index + 1}`} website in a new tab`}
                onClick={(event) => {
                  if (!business.url) event.preventDefault()
                }}
              >
                <Globe2 size={14} />
              </a>
              {businesses.length > 1 && <button type="button" className="remove-business" onClick={() => onRemoveBusiness(business.id)} disabled={isBusy} aria-label={`Remove business ${index + 1}`}><X size={14} /></button>}
            </div>
          ))}
        </div>

        {formError && <div className="form-error" role="alert"><CircleAlert size={15} />{formError}</div>}
        <div className="composer-actions">
          <div className="privacy-note"><span className="privacy-icon"><Globe2 size={13} /></span><span>HTTP(S) URLs <span className="note-separator">·</span> No site requests</span></div>
          {isBusy ? (
            <button type="button" className="cancel-button" onClick={onCancel}><span className="cancel-square" /> Cancel run</button>
          ) : (
            <button type="submit" className="start-button">
              <Rocket size={15} /> {hasRun ? 'Start another task' : 'Start live run'} <span className="button-arrow">↗</span>
            </button>
          )}
        </div>
        <div className="demo-error-hint">Uses the configured Nebius model and may use credits. Website fetching is disabled.</div>
      </form>
    </section>
  )
}

function SparkleMark() {
  return <span className="task-sparkle"><LoaderCircle size={16} /></span>
}

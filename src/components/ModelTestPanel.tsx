import { useState } from 'react'
import { CircleAlert, LoaderCircle, Sparkles } from 'lucide-react'
import type { Business } from '../types'

type Usage = {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

type TestResult =
  | { mode: 'mock'; mock: true; output: string }
  | { mode: 'live'; mock: false; output: string; usage?: Usage }

type ModelTestPanelProps = {
  task: string
  businesses: Business[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return 'unavailable'
  }
}

function makePrompt(task: string, businesses: Business[]): string {
  const businessContext = businesses
    .map(({ name, url }) => `${name.trim().slice(0, 60)} (${getHostname(url)})`)
    .join(', ')

  return [
    'Give a concise first-pass response to this task. Use only the supplied context; do not claim to have visited websites.',
    `Task: ${task.trim().slice(0, 760)}`,
    `Businesses: ${businessContext.slice(0, 260)}`,
  ].join('\n')
}

export function ModelTestPanel({ task, businesses }: ModelTestPanelProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)
  const [error, setError] = useState('')

  async function testModel() {
    setIsLoading(true)
    setResult(null)
    setError('')

    try {
      const response = await fetch('/api/test-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: makePrompt(task, businesses) }),
      })
      const body: unknown = await response.json()

      if (!response.ok) {
        const message = isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string'
          ? body.error.message
          : 'The model test failed. Check the server configuration.'
        setError(message)
        return
      }

      if (
        !isRecord(body)
        || (body.mode !== 'mock' && body.mode !== 'live')
        || typeof body.output !== 'string'
        || typeof body.mock !== 'boolean'
      ) {
        setError('The model test returned an invalid response.')
        return
      }

      if (body.mode === 'mock' && body.mock) {
        setResult({ mode: 'mock', mock: true, output: body.output })
        return
      }

      if (body.mode === 'live' && body.mock === false) {
        const usageValue = body.usage
        const usage = isRecord(usageValue) ? {
          promptTokens: typeof usageValue.promptTokens === 'number' ? usageValue.promptTokens : undefined,
          completionTokens: typeof usageValue.completionTokens === 'number' ? usageValue.completionTokens : undefined,
          totalTokens: typeof usageValue.totalTokens === 'number' ? usageValue.totalTokens : undefined,
        } : undefined
        setResult({ mode: 'live', mock: false, output: body.output, usage })
        return
      }
      setError('The model test returned an invalid response.')
    } catch {
      setError('Could not reach the local API. No automatic retry was made.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section className="model-test-panel panel" aria-labelledby="model-test-title">
      <div className="section-heading">
        <div className="section-title-wrap">
          <span className="section-icon results-icon"><Sparkles size={15} /></span>
          <div>
            <h2 id="model-test-title">Manual model test</h2>
            <p>One inference request, only when you choose</p>
          </div>
        </div>
        <span className="sample-label"><span /> MANUAL ONLY</span>
      </div>
      <div className="model-test-body">
        <p className="model-test-note">
          Sends the task and business names/domains only. No website text is fetched. Live requests may use paid Nebius credit; the demo mission stays simulated.
        </p>
        <button className="secondary-button model-test-button" type="button" onClick={testModel} disabled={isLoading}>
          {isLoading ? <LoaderCircle className="spin-icon" size={14} /> : <Sparkles size={14} />}
          {isLoading ? 'Sending one request…' : 'Send one model test'}
        </button>
        {error && <div className="model-test-error" role="alert"><CircleAlert size={14} />{error}</div>}
        {result && (
          <div className="model-test-result" aria-live="polite">
            <span className={`model-mode-label ${result.mode}`}>
              {result.mock ? 'MOCK · NO AI CALLED' : 'LIVE MODEL RESPONSE'}
            </span>
            <p>{result.output}</p>
            {!result.mock && result.usage && (
              <div className="model-usage">
                <span>Prompt: {result.usage.promptTokens ?? '—'} tokens</span>
                <span>Completion: {result.usage.completionTokens ?? '—'} tokens</span>
                {result.usage.totalTokens !== undefined && <span>Total: {result.usage.totalTokens} tokens</span>}
              </div>
            )}
            {!result.mock && !result.usage && <small>Token usage was not included in the API response.</small>}
          </div>
        )}
      </div>
    </section>
  )
}

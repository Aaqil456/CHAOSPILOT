export type RunStatus = 'idle' | 'running' | 'completed' | 'error' | 'cancelled'

export type Business = {
  id: string
  name: string
  url: string
}

export type ProposalDraft = {
  business: Business
  score: number
  headline: string
  intro: string
  opportunities: string[]
  accent: string
}

export type ExecutionStep = {
  id: string
  title: string
  description: string
  output: string
}

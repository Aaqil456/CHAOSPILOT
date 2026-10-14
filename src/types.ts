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

export type AgentToolTrace = {
  id: string
  name: string
  input: unknown
  output: string
  status: 'completed' | 'error'
}

export type AgentRunResponse = {
  mode: 'live'
  agentName: 'Website Growth Agent'
  liveModel: true
  liveWebsiteFetch: false
  model: string
  answer: string
  trace: AgentToolTrace[]
  activatedSkills: string[]
  turns: number
  stopReason: 'final' | 'turn_limit' | 'tool_call_limit'
}

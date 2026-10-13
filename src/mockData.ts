import type { ExecutionStep, ProposalDraft } from './types'

export const executionSteps: ExecutionStep[] = [
  {
    id: 'plan',
    title: 'Planning an example review',
    description: 'Simulated demo step; no AI request is made.',
    output: 'Demo only · no research plan was generated',
  },
  {
    id: 'inspect',
    title: 'Website review (simulated)',
    description: 'No public website content is fetched in this preview.',
    output: 'Demo only · no websites were opened or reviewed',
  },
  {
    id: 'analyze',
    title: 'Preparing example ideas',
    description: 'Displaying static sample content, not website-based findings.',
    output: 'Demo only · no opportunities were analyzed',
  },
  {
    id: 'draft',
    title: 'Showing sample proposal drafts',
    description: 'These editable templates are not AI-generated or personalized.',
    output: 'Sample templates · not generated from your task',
  },
]

export const proposalDrafts: Omit<ProposalDraft, 'business'>[] = [
  {
    score: 86,
    headline: 'Make the first choice simple.',
    intro: 'This sample draft shows how a business could make its main offer easier to understand and act on.',
    opportunities: [
      'Put the main customer benefit near the top of the page.',
      'Give first-time visitors a clear path to explore the offer.',
      'Explain the value beside the primary call to action.',
    ],
    accent: 'mint',
  },
  {
    score: 92,
    headline: 'Put the proof up front.',
    intro: 'This sample draft shows how a business could use clear evidence to help visitors decide what to do next.',
    opportunities: [
      'Feature a customer outcome or useful proof point early.',
      'Make key information easier to scan.',
      'Make it simple to ask a question or get started.',
    ],
    accent: 'lavender',
  },
  {
    score: 89,
    headline: 'Make the next step easy.',
    intro: 'This sample draft shows how clearer messaging and a simpler journey could help visitors take action.',
    opportunities: [
      'Make the primary customer benefit easy to spot.',
      'Place supporting proof near the main call to action.',
      'Reduce friction between discovery and taking action.',
    ],
    accent: 'peach',
  },
]

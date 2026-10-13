import type { Business, ExecutionStep, ProposalDraft } from './types'

export const demoBusinesses: Business[] = [
  { id: 'business-1', name: 'Northstar Coffee', url: 'https://northstarcoffee.example' },
  { id: 'business-2', name: 'Fieldwork Studio', url: 'https://fieldworkstudio.example' },
]

export const executionSteps: ExecutionStep[] = [
  {
    id: 'plan',
    title: 'Building a research plan',
    description: 'Breaking your brief into focused research steps.',
    tool: 'plan_builder',
    output: '4 steps planned · 2 business websites in scope',
  },
  {
    id: 'inspect',
    title: 'Inspecting business websites',
    description: 'Reviewing each site’s messaging, layout, and calls to action.',
    tool: 'website_inspector',
    output: '2 websites reviewed · Key pages and messaging captured',
  },
  {
    id: 'analyze',
    title: 'Finding conversion opportunities',
    description: 'Turning website observations into practical improvements.',
    tool: 'opportunity_analyzer',
    output: '6 opportunities identified · Prioritized by potential impact',
  },
  {
    id: 'draft',
    title: 'Drafting tailored proposals',
    description: 'Creating a specific, actionable proposal for each business.',
    tool: 'proposal_writer',
    output: '2 personalized proposal drafts are ready for review',
  },
]

export const proposalDrafts: Omit<ProposalDraft, 'business'>[] = [
  {
    score: 86,
    headline: 'Make the first sip feel closer.',
    intro: 'Northstar Coffee has the makings of a memorable local favorite. A more direct path from the story behind the beans to a first order could turn curious visitors into regulars.',
    opportunities: [
      'Bring the featured roast and its tasting notes into the first screen.',
      'Add a clear “Find your next favorite” path for first-time shoppers.',
      'Show the subscription value beside the purchase decision.',
    ],
    accent: 'mint',
  },
  {
    score: 92,
    headline: 'Let the work speak sooner.',
    intro: 'Fieldwork Studio’s portfolio can do more of the selling. Lead with recognizable project outcomes, then give prospective clients a simple next step to start a conversation.',
    opportunities: [
      'Open with a standout case study and its measurable result.',
      'Add concise project summaries to make the portfolio easier to scan.',
      'Move a low-friction project inquiry into the main navigation.',
    ],
    accent: 'lavender',
  },
  {
    score: 89,
    headline: 'Turn more visits into first orders.',
    intro: 'A clearer first-visit journey can help this business convert attention into action. Sharpen the value proposition and make the next step feel effortless.',
    opportunities: [
      'Make the primary customer benefit easy to spot above the fold.',
      'Use customer proof close to the primary call to action.',
      'Simplify the route from product discovery to purchase.',
    ],
    accent: 'peach',
  },
]

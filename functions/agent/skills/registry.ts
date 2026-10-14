import type { AgentSkill } from '../runtime'
import {
  competitorResearch,
  contentGeneration,
  websiteAnalysis,
  websiteInspection,
} from '../instructions.generated'

export const agentSkills: AgentSkill[] = [
  {
    name: 'website-inspection',
    description: 'Inspect supplied website evidence when the task requires it.',
    content: websiteInspection,
  },
  {
    name: 'competitor-research',
    description: 'Compare user-supplied competitors using only available evidence.',
    content: competitorResearch,
  },
  {
    name: 'website-analysis',
    description: 'Prioritize available evidence against the user’s objective.',
    content: websiteAnalysis,
  },
  {
    name: 'content-generation',
    description: 'Create the specific text deliverable the user requests.',
    content: contentGeneration,
  },
]

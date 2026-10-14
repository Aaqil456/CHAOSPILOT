import { z } from 'zod'
import type { AgentTool } from './runtime'

const inspectWebsiteInput = z.object({
  businessId: z.string().min(1).max(100),
}).strict()

export const inspectWebsiteTool: AgentTool = {
  name: 'inspect_website',
  description: 'Return a mock-only website inspection result for a submitted business. No request is made.',
  inputSchema: inspectWebsiteInput,
  async execute(input, context) {
    const { businessId } = inspectWebsiteInput.parse(input)
    const business = context.businesses.find((candidate) => candidate.id === businessId)
    if (!business) {
      throw new Error('The requested business was not included in this run.')
    }

    return {
      mode: 'mock',
      inspected: false,
      businessId: business.id,
      businessName: business.name,
      submittedUrl: business.url,
      evidence: [],
      message: 'Mock result only. No website request was made and no page evidence is available.',
    }
  },
}

export const agentTools: AgentTool[] = [inspectWebsiteTool]

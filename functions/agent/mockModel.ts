import type { AgentModel, AgentModelInput } from './runtime'

function selectSkills(input: AgentModelInput): string[] {
  const task = input.task.toLowerCase()
  const requested: string[] = []

  if (/\b(competitor|competitors|compare|comparison)\b/.test(task)) {
    requested.push('competitor-research')
  }
  if (/\b(analy[sz]e|analysis|prioriti[sz]e|recommend|recommendation|opportunit|improv)\b/.test(task)) {
    requested.push('website-analysis')
  }
  if (/\b(write|draft|create|generate|copy|content|proposal|landing page)\b/.test(task)) {
    requested.push('content-generation')
  }
  if (
    input.businesses.length > 0
    && /\b(website|web page|site)\b/.test(task)
    && /\b(inspect|review|audit|compare|comparison|analy[sz]e|improv|opportunit)\b/.test(task)
  ) {
    requested.push('website-inspection')
  }

  const active = new Set(input.activeSkills.map((skill) => skill.name))
  const available = new Set(input.availableSkills.map((skill) => skill.name))
  return [...new Set(requested)].filter((name) => available.has(name) && !active.has(name))
}

function shouldInspect(input: AgentModelInput): boolean {
  return input.businesses.length > 0
    && /\b(website|web page|site|competitor|compare|comparison)\b/i.test(input.task)
    && /\b(inspect|review|audit|compare|comparison|analy[sz]e|improv|opportunit)\b/i.test(input.task)
    && input.tools.some((tool) => tool.name === 'inspect_website')
}

export const mockModel: AgentModel = {
  async decide(input) {
    const skillsToActivate = selectSkills(input)
    if (skillsToActivate.length > 0) {
      return { type: 'activate_skills', skillNames: skillsToActivate }
    }

    const inspectionResults = input.messages.filter(
      (message) => message.role === 'tool' && message.toolName === 'inspect_website',
    )
    if (shouldInspect(input) && inspectionResults.length < input.businesses.length) {
      const nextBusiness = input.businesses[inspectionResults.length]
      if (nextBusiness) {
        return {
          type: 'tool_calls',
          toolCalls: [{
            id: `mock-inspect-${inspectionResults.length + 1}`,
            name: 'inspect_website',
            arguments: { businessId: nextBusiness.id },
          }],
        }
      }
    }

    if (inspectionResults.length > 0) {
      return {
        type: 'final',
        content: 'The mock inspection results contain no page evidence, so I cannot make factual or personalized findings. This run made no website requests and no live model call. Enable a verified, SSRF-safe inspection capability and compatible model before asking for evidence-based website conclusions.',
      }
    }

    return {
      type: 'final',
      content: 'This mock run cannot reliably complete open-ended tasks because no live model is connected. It made no website request and no Nebius call. The registered mock tool can demonstrate orchestration, but returns no real-world evidence.',
    }
  },
}

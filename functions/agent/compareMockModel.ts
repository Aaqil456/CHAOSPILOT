// Deterministic local stand-in for the model on the compare endpoint. It drives
// the real tools (including real website fetches) and writes rule-based text
// labelled [MOCK]. It is never used on non-local hosts.

import type { PageEvidence } from './pageEvidence.ts'
import type { AgentDecision, AgentMessage, AgentModel, AgentModelInput } from './runtime.ts'
import { computeSiteScore, type ScoreCheck, type SiteScore } from './siteScore.ts'

function toolResults(messages: AgentMessage[], toolName: string): Array<Record<string, unknown>> {
  return messages.flatMap((message) => {
    if (message.role !== 'tool' || message.toolName !== toolName) return []
    try {
      const value: unknown = JSON.parse(message.content)
      return typeof value === 'object' && value !== null ? [value as Record<string, unknown>] : []
    } catch {
      return []
    }
  })
}

function describe(check: ScoreCheck | undefined): string {
  return check ? `${check.label}: ${check.detail} (${check.points}/${check.max})` : 'No data'
}

function decide(input: AgentModelInput): AgentDecision {
  const asked = input.messages.some((message) => message.role === 'assistant' && message.toolCalls?.some((call) => call.name === 'inspect_website'))
  if (!asked) {
    return {
      type: 'tool_calls',
      toolCalls: input.businesses.map((business) => ({
        id: `mock-inspect-${business.id}`,
        name: 'inspect_website',
        arguments: { business_id: business.id },
      })),
    }
  }

  const scored = new Map<string, { name: string; score: SiteScore }>()
  for (const result of toolResults(input.messages, 'inspect_website')) {
    const id = typeof result.business_id === 'string' ? result.business_id : ''
    const evidence = result.evidence as PageEvidence | undefined
    const business = input.businesses.find((candidate) => candidate.id === id)
    if (business && evidence) scored.set(id, { name: business.name, score: computeSiteScore(evidence) })
  }

  const alreadySaved = toolResults(input.messages, 'save_comparison').some((result) => result.saved === true)
  const a = scored.get('b1')
  const b = scored.get('b2')

  if (a && b && !alreadySaved) {
    const diffs = a.score.checks
      .map((check, index) => ({ check, other: b.score.checks[index], gap: Math.abs(check.points - (b.score.checks[index]?.points ?? 0)) }))
      .filter((item) => item.gap > 0)
      .sort((x, y) => y.gap - x.gap)
      .slice(0, 4)
    const differences = diffs.map((item) => ({
      aspect: item.check.label,
      site_a: describe(item.check),
      site_b: describe(item.other),
      takeaway: `[MOCK] ${item.check.points > (item.other?.points ?? 0) ? a.name : b.name} does better on this check.`,
    }))
    while (differences.length < 2) {
      differences.push({
        aspect: 'On-page basics score',
        site_a: `${a.name}: ${a.score.value}/100`,
        site_b: `${b.name}: ${b.score.value}/100`,
        takeaway: '[MOCK] The two sites are very similar on the checks measured.',
      })
    }
    const lower = a.score.value <= b.score.value ? a : b
    const gaps = lower.score.checks
      .filter((check) => check.status !== 'skipped' && check.points < check.max)
      .sort((x, y) => (y.max - y.points) - (x.max - x.points))
      .slice(0, 3)
    const higher = lower === a ? b : a
    return {
      type: 'tool_calls',
      toolCalls: [{
        id: 'mock-save-comparison',
        name: 'save_comparison',
        arguments: {
          summary: `[MOCK] ${a.name} scores ${a.score.value}/100 and ${b.name} scores ${b.score.value}/100 on on-page basics. ${higher.name} is ahead by ${Math.abs(a.score.value - b.score.value)} points. Rule-based text, not AI-written.`,
          differences,
          priorities: gaps.length > 0
            ? gaps.map((check) => `[MOCK] ${lower.name}: improve "${check.label}" (${check.detail}).`)
            : [`[MOCK] ${lower.name}: no gaps found on the checks measured.`],
        },
      }],
    }
  }

  return {
    type: 'final',
    content: a && b
      ? `[MOCK] Inspected 2 of 2 websites with real HTTP requests and saved a rule-based comparison. No AI model was called.`
      : `[MOCK] Inspected ${scored.size} of ${input.businesses.length} websites; a comparison needs both. No AI model was called.`,
  }
}

export const compareMockModel: AgentModel = {
  async decide(input) {
    return decide(input)
  },
}

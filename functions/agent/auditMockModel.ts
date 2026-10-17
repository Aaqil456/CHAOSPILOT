// Deterministic local stand-in for the AI model. It drives the real audit tools
// (including real website fetches) but writes rule-based proposals. Every
// output is labelled [MOCK]; it is never used on non-local hosts.

import type { AgentDecision, AgentMessage, AgentModel, AgentModelInput } from './runtime.ts'
import type { PageEvidence } from './pageEvidence.ts'

type MockFinding = { title: string; evidence: string; recommendation: string; impact: 'high' | 'medium' | 'low' }

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

function ruleFindings(evidence: PageEvidence): MockFinding[] {
  const findings: MockFinding[] = []
  if (!evidence.https) findings.push({ title: 'Site is not served over HTTPS', evidence: 'https: false', recommendation: 'Enable HTTPS and redirect all HTTP traffic to it.', impact: 'high' })
  if (!evidence.metaDescription) findings.push({ title: 'Missing meta description', evidence: 'metaDescription: null', recommendation: 'Add a 140–160 character description that names the main service and location.', impact: 'high' })
  if (!evidence.hasViewport) findings.push({ title: 'No mobile viewport tag', evidence: 'hasViewport: false', recommendation: 'Add a responsive viewport meta tag and check the layout on phones.', impact: 'high' })
  if (evidence.callsToAction.length === 0) findings.push({ title: 'No clear call to action', evidence: 'callsToAction: []', recommendation: 'Add a prominent primary action such as “Book now” or “Get a quote”.', impact: 'high' })
  if (!evidence.contact.phone && !evidence.contact.email && evidence.contact.forms === 0) findings.push({ title: 'No visible contact route', evidence: 'contact.phone/email false, forms: 0', recommendation: 'Show a phone number, email or short enquiry form on the homepage.', impact: 'high' })
  if (evidence.headings.h1Count !== 1) findings.push({ title: 'Heading structure needs work', evidence: `headings.h1Count: ${evidence.headings.h1Count}`, recommendation: 'Use exactly one descriptive H1 that states what the business offers.', impact: 'medium' })
  if (evidence.images.missingAlt > 0) findings.push({ title: 'Images missing alt text', evidence: `images.missingAlt: ${evidence.images.missingAlt}`, recommendation: 'Add short descriptive alt text to every meaningful image.', impact: 'medium' })
  if (!evidence.openGraph.image) findings.push({ title: 'No social sharing image', evidence: 'openGraph.image: false', recommendation: 'Add og:title and og:image tags so shared links show a preview.', impact: 'low' })
  if (findings.length === 0) findings.push({ title: 'Solid technical basics', evidence: 'No rule-based gaps detected', recommendation: 'Focus on conversion copy and testimonials.', impact: 'low' })
  return findings.slice(0, 5)
}

function decide(input: AgentModelInput): AgentDecision {
  const inspected = toolResults(input.messages, 'inspect_website').filter((result) => result.evidence)
  const attempted = new Set(input.messages.flatMap((message) =>
    message.role === 'assistant' ? (message.toolCalls ?? []).filter((call) => call.name === 'inspect_website').map((call) => call.id) : []))

  if (attempted.size === 0) {
    return {
      type: 'tool_calls',
      toolCalls: input.businesses.map((business) => ({
        id: `mock-inspect-${business.id}`,
        name: 'inspect_website',
        arguments: { business_id: business.id },
      })),
    }
  }

  const saved = new Set(toolResults(input.messages, 'save_proposal').map((result) => result.business_id))
  for (const result of inspected) {
    const businessId = typeof result.business_id === 'string' ? result.business_id : ''
    const evidence = result.evidence as PageEvidence | undefined
    const business = input.businesses.find((candidate) => candidate.id === businessId)
    if (!business || !evidence || saved.has(businessId)) continue
    const findings = ruleFindings(evidence)
    return {
      type: 'tool_calls',
      toolCalls: [{
        id: `mock-save-${businessId}`,
        name: 'save_proposal',
        arguments: {
          business_id: businessId,
          summary: `[MOCK] Rule-based summary for ${business.name}: ${findings.length} improvement area(s) detected from the fetched homepage.`,
          findings,
          email_subject: `[MOCK] Website improvements for ${business.name}`,
          email_body: `[MOCK — rule-based text, not AI-written]\n\nHi ${business.name} team,\n\nWe reviewed ${evidence.url} and found a few practical improvements:\n\n${findings.map((finding) => `• ${finding.title}: ${finding.recommendation}`).join('\n')}\n\nWe would be happy to help put these in place.\n\nThe ChaosPilot team`,
        },
      }],
    }
  }

  return {
    type: 'final',
    content: `[MOCK] Inspected ${inspected.length} of ${input.businesses.length} website(s) with real HTTP requests and saved ${saved.size} rule-based proposal(s). No AI model was called.`,
  }
}

export const auditMockModel: AgentModel = {
  async decide(input) {
    return decide(input)
  },
}

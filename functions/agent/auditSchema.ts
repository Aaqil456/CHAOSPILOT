// Shared runtime contracts for the website-audit agent. Imported by the Pages
// Function and by the browser so both sides validate the same shapes.

import { z } from 'zod'
import { siteScoreSchema } from './siteScore.ts'
import { isSafePublicHttpUrl } from './urlSafety.ts'

export const businessInputSchema = z.object({
  name: z.string().trim().min(1, 'Business name is required.').max(80),
  url: z.string().trim().max(500).refine(isSafePublicHttpUrl, 'Use a public http(s) website address.'),
}).strict()

export const auditRequestSchema = z.object({
  task: z.string().trim().min(1).max(2000),
  businesses: z.array(businessInputSchema).length(1, 'Audit one website at a time.'),
}).strict()

export type AuditRequest = z.infer<typeof auditRequestSchema>

function siteKey(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return url
  }
}

export const compareRequestSchema = z.object({
  task: z.string().trim().min(1).max(2000),
  businesses: z.array(businessInputSchema).length(2, 'Enter exactly two websites to compare.'),
}).strict().superRefine((request, context) => {
  const [first, second] = request.businesses
  if (first && second && siteKey(first.url) === siteKey(second.url)) {
    context.addIssue({ code: 'custom', path: ['businesses', 1, 'url'], message: 'Enter two different websites to compare.' })
  }
})

export type CompareRequest = z.infer<typeof compareRequestSchema>

export const impactLevels = ['high', 'medium', 'low'] as const

export const findingSchema = z.object({
  title: z.string().min(3).max(120).describe('Short name of the issue or opportunity.'),
  evidence: z.string().min(3).max(300).describe('The specific inspected fact this finding is based on.'),
  recommendation: z.string().min(3).max(400).describe('Concrete improvement to make.'),
  impact: z.enum(impactLevels),
}).strict()

export const proposalInputSchema = z.object({
  business_id: z.string().min(1).max(20),
  summary: z.string().min(10).max(600).describe('Two or three sentences on the site’s current state.'),
  findings: z.array(findingSchema).min(1).max(6),
  email_subject: z.string().min(3).max(140),
  email_body: z.string().min(40).max(3000).describe('Personalised outreach proposal. Plain text, no placeholders like [Name].'),
}).strict()

export type ProposalInput = z.infer<typeof proposalInputSchema>
export type Finding = z.infer<typeof findingSchema>

export const comparisonInputSchema = z.object({
  summary: z.string().min(20).max(700).describe('Two to four sentences: which site has stronger on-page basics according to the scores, by how much, and why.'),
  differences: z.array(z.object({
    aspect: z.string().min(3).max(80).describe('What is being compared, for example "Calls to action".'),
    site_a: z.string().min(3).max(250).describe('What site A shows for this aspect, citing an inspected value.'),
    site_b: z.string().min(3).max(250).describe('What site B shows for this aspect, citing an inspected value.'),
    takeaway: z.string().min(3).max(300).describe('One sentence on what the difference means.'),
  }).strict()).min(2).max(5),
  priorities: z.array(z.string().min(3).max(250)).min(1).max(4)
    .describe('Ordered fixes for the lower-scoring site, most valuable first.'),
}).strict()

export const comparisonSchema = z.object({
  summary: z.string(),
  differences: z.array(z.object({
    aspect: z.string(),
    siteA: z.string(),
    siteB: z.string(),
    takeaway: z.string(),
  })),
  priorities: z.array(z.string()),
})
export type Comparison = z.infer<typeof comparisonSchema>

export const auditBusinessSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
})
export type AuditBusiness = z.infer<typeof auditBusinessSchema>

export const traceStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  input: z.unknown(),
  output: z.string(),
  status: z.enum(['completed', 'error']),
  durationMs: z.number().optional(),
})

export const proposalSchema = z.object({
  businessId: z.string(),
  summary: z.string(),
  findings: z.array(findingSchema),
  emailSubject: z.string(),
  emailBody: z.string(),
})
export type Proposal = z.infer<typeof proposalSchema>

export const inspectionSummarySchema = z.object({
  businessId: z.string(),
  status: z.enum(['inspected', 'failed', 'not_inspected']),
  error: z.string().nullable(),
  pages: z.array(z.object({
    url: z.string(),
    title: z.string().nullable(),
    status: z.number(),
    responseMs: z.number(),
    htmlKB: z.number(),
  })),
  evidence: z.record(z.string(), z.unknown()).nullable(),
  score: siteScoreSchema.nullable().default(null),
})
export type InspectionSummary = z.infer<typeof inspectionSummarySchema>

export const auditStreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('run_started'),
    mode: z.enum(['live', 'mock']),
    model: z.string(),
    businesses: z.array(auditBusinessSchema),
  }),
  z.object({ type: z.literal('model_turn'), turn: z.number() }),
  z.object({
    type: z.literal('tool_started'),
    turn: z.number(),
    id: z.string(),
    name: z.string(),
    input: z.unknown(),
  }),
  z.object({ type: z.literal('tool_finished'), turn: z.number(), step: traceStepSchema }),
  z.object({
    type: z.literal('result'),
    answer: z.string(),
    proposals: z.array(proposalSchema),
    comparison: comparisonSchema.nullable().default(null),
    inspections: z.array(inspectionSummarySchema),
    turns: z.number(),
    stopReason: z.enum(['final', 'turn_limit', 'tool_call_limit']),
    warnings: z.array(z.string()),
  }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
])
export type AuditStreamEvent = z.infer<typeof auditStreamEventSchema>

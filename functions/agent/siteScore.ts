// On-page basics score (0–100), computed deterministically from page evidence.
// The model never calculates or edits it: the same page always gets the same
// score, and every point can be traced to an inspected value.

import { z } from 'zod'
import type { PageEvidence } from './pageEvidence.ts'

export const scoreCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  points: z.number(),
  max: z.number(),
  status: z.enum(['pass', 'partial', 'fail', 'skipped']),
  detail: z.string(),
})
export type ScoreCheck = z.infer<typeof scoreCheckSchema>

export const siteScoreSchema = z.object({
  value: z.number().min(0).max(100),
  earned: z.number(),
  possible: z.number(),
  band: z.enum(['strong', 'fair', 'weak']),
  /** True when the page looks JavaScript-rendered or was cut at the size limit. */
  limitedEvidence: z.boolean(),
  checks: z.array(scoreCheckSchema),
})
export type SiteScore = z.infer<typeof siteScoreSchema>

export const scoreLabel = 'On-page basics score'

function check(
  id: string,
  label: string,
  max: number,
  points: number,
  detail: string,
): ScoreCheck {
  const status = points >= max ? 'pass' : points > 0 ? 'partial' : 'fail'
  return { id, label, points, max, status, detail }
}

function lengthDetail(name: string, value: string | null): string {
  return value === null ? `${name}: null` : `${name}: ${value.length} characters`
}

export function computeSiteScore(evidence: PageEvidence): SiteScore {
  const checks: ScoreCheck[] = []

  checks.push(check('https', 'Served over HTTPS', 10, evidence.https ? 10 : 0, `https: ${evidence.https}`))
  checks.push(check('viewport', 'Mobile viewport tag', 10, evidence.hasViewport ? 10 : 0, `hasViewport: ${evidence.hasViewport}`))

  const titleLength = evidence.title?.length ?? 0
  checks.push(check(
    'title',
    'Page title',
    6,
    titleLength === 0 ? 0 : titleLength >= 10 && titleLength <= 70 ? 6 : 3,
    lengthDetail('title', evidence.title),
  ))

  const descriptionLength = evidence.metaDescription?.length ?? 0
  checks.push(check(
    'meta-description',
    'Meta description',
    12,
    descriptionLength === 0 ? 0 : descriptionLength >= 70 && descriptionLength <= 180 ? 12 : 6,
    evidence.metaDescription === null ? 'metaDescription: null' : lengthDetail('metaDescription', evidence.metaDescription),
  ))

  const h1Count = evidence.headings.h1Count
  checks.push(check('h1', 'One clear main heading (H1)', 8, h1Count === 1 ? 8 : h1Count > 1 ? 4 : 0, `headings.h1Count: ${h1Count}`))
  checks.push(check('h2', 'Section headings (H2)', 4, evidence.headings.h2Count > 0 ? 4 : 0, `headings.h2Count: ${evidence.headings.h2Count}`))

  checks.push(check(
    'cta',
    'Clear call to action',
    12,
    evidence.callsToAction.length > 0 ? 12 : 0,
    evidence.callsToAction.length > 0 ? `callsToAction: ${evidence.callsToAction.slice(0, 3).join(', ')}` : 'callsToAction: []',
  ))

  const routes = [evidence.contact.phone, evidence.contact.email, evidence.contact.forms > 0].filter(Boolean).length
  checks.push(check(
    'contact',
    'Contact route (phone, email or form)',
    12,
    routes >= 2 ? 12 : routes === 1 ? 8 : 0,
    `contact: phone ${evidence.contact.phone}, email ${evidence.contact.email}, forms ${evidence.contact.forms}`,
  ))

  if (evidence.images.total === 0) {
    checks.push({ id: 'alt-text', label: 'Image alt text', points: 0, max: 8, status: 'skipped', detail: 'images.total: 0 (no images to check)' })
  } else {
    const withAlt = evidence.images.total - evidence.images.missingAlt
    checks.push(check(
      'alt-text',
      'Image alt text',
      8,
      Math.round((withAlt / evidence.images.total) * 8),
      `images.missingAlt: ${evidence.images.missingAlt} of ${evidence.images.total}`,
    ))
  }

  const og = Number(evidence.openGraph.title) + Number(evidence.openGraph.image)
  checks.push(check('social-preview', 'Social sharing preview', 6, og * 3, `openGraph: title ${evidence.openGraph.title}, image ${evidence.openGraph.image}`))
  checks.push(check('structured-data', 'Structured data (JSON-LD)', 4, evidence.structuredData ? 4 : 0, `structuredData: ${evidence.structuredData}`))
  checks.push(check('indexable', 'Allowed to be indexed', 4, evidence.noindex ? 0 : 4, `noindex: ${evidence.noindex}`))
  checks.push(check(
    'content',
    'Enough page text',
    4,
    evidence.wordCount >= 150 ? 4 : evidence.wordCount >= 50 ? 2 : 0,
    `wordCount: ${evidence.wordCount}`,
  ))

  const applicable = checks.filter((item) => item.status !== 'skipped')
  const earned = applicable.reduce((total, item) => total + item.points, 0)
  const possible = applicable.reduce((total, item) => total + item.max, 0)
  const value = possible === 0 ? 0 : Math.round((earned / possible) * 100)

  return {
    value,
    earned,
    possible,
    band: value >= 80 ? 'strong' : value >= 55 ? 'fair' : 'weak',
    limitedEvidence: evidence.likelyClientRendered || evidence.truncated,
    checks,
  }
}

/** The checks that lost points, biggest loss first. Used to guide the model. */
export function biggestGaps(score: SiteScore, limit = 6): ScoreCheck[] {
  return score.checks
    .filter((item) => item.status !== 'skipped' && item.points < item.max)
    .sort((a, b) => (b.max - b.points) - (a.max - a.points))
    .slice(0, limit)
}

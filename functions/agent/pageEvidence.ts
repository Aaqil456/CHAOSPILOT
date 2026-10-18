// Turns fetched HTML into a compact, factual evidence summary for the model.
// A small tag scanner is used instead of HTMLRewriter so the same code runs in
// Workers and in Node tests. Page text is untrusted data, never instructions.

import type { FetchedPage } from './safeFetch.ts'

export type PageEvidence = {
  url: string
  status: number
  redirects: string[]
  https: boolean
  responseMs: number
  htmlKB: number
  truncated: boolean
  language: string | null
  title: string | null
  metaDescription: string | null
  hasViewport: boolean
  canonical: string | null
  noindex: boolean
  openGraph: { title: boolean; image: boolean }
  structuredData: boolean
  headings: { h1: string[]; h2: string[]; h1Count: number; h2Count: number }
  images: { total: number; missingAlt: number }
  links: { internal: number; external: number; internalPaths: string[] }
  callsToAction: string[]
  contact: { phone: boolean; email: boolean; forms: number; address: boolean }
  socialProfiles: string[]
  scripts: number
  stylesheets: number
  wordCount: number
  likelyClientRendered: boolean
  textExcerpt: string
}

const skippedContentTags = new Set(['script', 'style', 'noscript', 'template', 'svg', 'iframe'])
const capturedTags = new Set(['title', 'h1', 'h2', 'a', 'button'])
const ctaPattern = /\b(book|order|buy|shop|contact|call|get (a|your|started|in touch)|quote|start|sign ?up|subscribe|reserve|schedule|enquire|inquire|request|join|donate|download|try|apply|register|menu|visit us)\b/i
const socialHosts: Array<[string, RegExp]> = [
  ['facebook', /(^|\.)facebook\.com$|(^|\.)fb\.com$/],
  ['instagram', /(^|\.)instagram\.com$/],
  ['x', /(^|\.)(twitter|x)\.com$/],
  ['linkedin', /(^|\.)linkedin\.com$/],
  ['tiktok', /(^|\.)tiktok\.com$/],
  ['youtube', /(^|\.)(youtube\.com|youtu\.be)$/],
  ['whatsapp', /(^|\.)(wa\.me|whatsapp\.com)$/],
  ['pinterest', /(^|\.)pinterest\.[a-z.]+$/],
]

const tagPattern = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!(?:doctype)?[^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi
const attributePattern = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

// HTML names for U+00A0 to U+00FF, in code point order (accented letters and common symbols).
const latin1Names = (
  'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest '
  + 'Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig '
  + 'agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'
).split(' ')

const namedEntities: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", trade: '™',
  ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•',
  euro: '€', equiv: '≡', larr: '←', rarr: '→', uarr: '↑', darr: '↓',
  ...Object.fromEntries(latin1Names.map((name, index) => [name, String.fromCodePoint(0xa0 + index)])),
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X'
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    return namedEntities[entity] ?? namedEntities[entity.toLowerCase()] ?? ' '
  })
}

function clean(text: string, limit: number): string {
  const value = decodeEntities(text).replace(/\s+/g, ' ').trim()
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value
}

function parseAttributes(source: string): Map<string, string> {
  const attributes = new Map<string, string>()
  for (const match of source.matchAll(attributePattern)) {
    const name = match[1].toLowerCase()
    if (!attributes.has(name)) attributes.set(name, match[2] ?? match[3] ?? match[4] ?? '')
  }
  return attributes
}

function resolveUrl(href: string, base: URL): URL | null {
  try {
    return new URL(decodeEntities(href.trim()), base)
  } catch {
    return null
  }
}

function sameSite(a: URL, b: URL): boolean {
  const strip = (hostname: string) => hostname.toLowerCase().replace(/^www\./, '')
  return strip(a.hostname) === strip(b.hostname)
}

function pushUnique(list: string[], value: string, max: number): void {
  if (value && list.length < max && !list.includes(value)) list.push(value)
}

export function extractPageEvidence(page: FetchedPage): PageEvidence {
  const base = new URL(page.finalUrl)
  const html = page.html
  const lowerHtml = html.toLowerCase()
  const textParts: string[] = []
  const captures = new Map<string, string[]>()
  let title: string | null = null
  let metaDescription: string | null = null
  let language: string | null = null
  let canonical: string | null = null
  let hasViewport = false
  let noindex = false
  let ogTitle = false
  let ogImage = false
  let structuredData = false
  const h1: string[] = []
  const h2: string[] = []
  let h1Count = 0
  let h2Count = 0
  let imagesTotal = 0
  let imagesMissingAlt = 0
  let internalLinks = 0
  let externalLinks = 0
  const internalPaths: string[] = []
  const callsToAction: string[] = []
  const socialProfiles: string[] = []
  let phone = false
  let email = false
  let forms = 0
  let scripts = 0
  let stylesheets = 0

  function appendText(text: string) {
    if (!text) return
    textParts.push(text)
    for (const parts of captures.values()) parts.push(text)
  }

  let cursor = 0
  tagPattern.lastIndex = 0
  for (let match = tagPattern.exec(html); match; match = tagPattern.exec(html)) {
    appendText(html.slice(cursor, match.index))
    cursor = tagPattern.lastIndex
    const name = match[2]?.toLowerCase()
    if (!name) continue
    const closing = match[1] === '/'

    if (closing) {
      const parts = captures.get(name)
      if (!parts) continue
      captures.delete(name)
      const text = clean(parts.join(' '), 120)
      if (name === 'title' && title === null) title = text || null
      else if (name === 'h1') pushUnique(h1, text, 5)
      else if (name === 'h2') pushUnique(h2, text, 8)
      else if ((name === 'a' || name === 'button') && ctaPattern.test(text) && text.length <= 60) {
        pushUnique(callsToAction, text, 10)
      }
      continue
    }

    const attributes = parseAttributes(match[3] ?? '')

    if (name === 'html') language = attributes.get('lang')?.trim() || null
    else if (name === 'meta') {
      const key = (attributes.get('name') ?? attributes.get('property') ?? '').toLowerCase()
      const content = attributes.get('content') ?? ''
      if (key === 'description' && metaDescription === null) metaDescription = clean(content, 300) || null
      else if (key === 'viewport') hasViewport = true
      else if (key === 'robots' && /noindex/i.test(content)) noindex = true
      else if (key === 'og:title') ogTitle = true
      else if (key === 'og:image') ogImage = true
    } else if (name === 'link') {
      const rel = (attributes.get('rel') ?? '').toLowerCase()
      if (rel.split(/\s+/).includes('canonical')) canonical = attributes.get('href') ?? null
      if (rel.split(/\s+/).includes('stylesheet')) stylesheets += 1
    } else if (name === 'img') {
      imagesTotal += 1
      if (!attributes.has('alt')) imagesMissingAlt += 1
    } else if (name === 'form') forms += 1
    else if (name === 'h1') h1Count += 1
    else if (name === 'h2') h2Count += 1
    else if (name === 'a') {
      const href = attributes.get('href') ?? ''
      if (/^tel:/i.test(href)) phone = true
      else if (/^mailto:/i.test(href)) email = true
      const target = /^(tel|mailto|javascript|data):/i.test(href) || href.startsWith('#') ? null : resolveUrl(href, base)
      if (target && (target.protocol === 'http:' || target.protocol === 'https:')) {
        if (sameSite(target, base)) {
          internalLinks += 1
          const path = target.pathname.replace(/\/+$/, '') || '/'
          if (path !== '/' && !/\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?)$/i.test(path)) {
            pushUnique(internalPaths, path, 20)
          }
        } else {
          externalLinks += 1
          const social = socialHosts.find(([, pattern]) => pattern.test(target.hostname.toLowerCase()))
          if (social) pushUnique(socialProfiles, social[0], socialHosts.length)
        }
      }
    }

    if (name === 'script') {
      scripts += 1
      if ((attributes.get('type') ?? '').toLowerCase() === 'application/ld+json') structuredData = true
    }

    if (skippedContentTags.has(name) && !match[0].endsWith('/>')) {
      const end = lowerHtml.indexOf(`</${name}`, cursor)
      cursor = end === -1 ? html.length : end
      tagPattern.lastIndex = cursor
      continue
    }
    if (capturedTags.has(name) && !captures.has(name)) captures.set(name, [])
    if (name === 'input' && (attributes.get('type') ?? '').toLowerCase() === 'submit') {
      const value = clean(attributes.get('value') ?? '', 60)
      if (ctaPattern.test(value)) pushUnique(callsToAction, value, 10)
    }
  }
  appendText(html.slice(cursor))

  const text = clean(textParts.join(' '), 100_000)
  const wordCount = text ? text.split(' ').filter((word) => /[\p{L}\p{N}]/u.test(word)).length : 0
  if (!phone && /(\+\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]\d{3,4}[\s.-]\d{3,4}/.test(text)) phone = true
  if (!email && /[\w.+-]+@[\w-]+\.[\w.-]+/.test(text)) email = true
  const address = /\b\d{1,5}\s+[\p{L}.'-]+(\s[\p{L}.'-]+){0,4}\s(street|st|road|rd|avenue|ave|jalan|jln|lane|ln|boulevard|blvd|drive|dr|way)\b/iu.test(text)
    || /\b(jalan|jln)\s+\p{L}+/iu.test(text)

  return {
    url: page.finalUrl,
    status: page.status,
    redirects: page.redirects,
    https: base.protocol === 'https:',
    responseMs: page.responseMs,
    htmlKB: Math.round(page.htmlBytes / 102.4) / 10,
    truncated: page.truncated,
    language,
    title,
    metaDescription,
    hasViewport,
    canonical,
    noindex,
    openGraph: { title: ogTitle, image: ogImage },
    structuredData,
    headings: { h1, h2, h1Count, h2Count },
    images: { total: imagesTotal, missingAlt: imagesMissingAlt },
    links: { internal: internalLinks, external: externalLinks, internalPaths },
    callsToAction,
    contact: { phone, email, forms, address },
    socialProfiles,
    scripts,
    stylesheets,
    wordCount,
    likelyClientRendered: wordCount < 20 && scripts > 0,
    textExcerpt: clean(text, 700),
  }
}

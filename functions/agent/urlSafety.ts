// Validation for user-supplied website URLs and every redirect target.
// Workers cannot resolve DNS before fetching, so this blocks every IP literal
// and private-looking hostname instead of checking resolved addresses.

const blockedHostnameSuffixes = [
  '.localhost',
  '.local',
  '.internal',
  '.intranet',
  '.lan',
  '.home',
  '.corp',
  '.private',
  '.arpa',
  '.test',
  '.invalid',
  '.example',
]

const blockedHostnames = new Set(['localhost', 'metadata.google.internal'])
const hostnameLabel = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeUrlError'
  }
}

function isIpLiteral(hostname: string): boolean {
  if (hostname.startsWith('[') || hostname.includes(':')) return true
  // WHATWG URL parsing already normalises decimal, hex and octal IPv4 forms
  // (for example http://2130706433/) to dotted decimal.
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)
}

export function assertPublicHttpUrl(input: string | URL): URL {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new UnsafeUrlError('The website URL is not a valid absolute URL.')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Only http:// and https:// website URLs are allowed.')
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError('Website URLs must not contain credentials.')
  }
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new UnsafeUrlError('Website URLs must use the default HTTP or HTTPS port.')
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  if (isIpLiteral(hostname)) {
    throw new UnsafeUrlError('IP-address URLs are not allowed; use the public domain name.')
  }
  if (blockedHostnames.has(hostname) || blockedHostnameSuffixes.some((suffix) => hostname.endsWith(suffix))) {
    throw new UnsafeUrlError('Local, internal and reserved hostnames are not allowed.')
  }

  const labels = hostname.split('.')
  if (
    labels.length < 2
    || hostname.length > 253
    || !labels.every((label) => hostnameLabel.test(label))
    || !/^(xn--[a-z0-9-]+|[a-z]{2,63})$/.test(labels[labels.length - 1])
  ) {
    throw new UnsafeUrlError('The website URL must use a public domain name.')
  }

  url.hash = ''
  return url
}

export function isSafePublicHttpUrl(input: string): boolean {
  try {
    assertPublicHttpUrl(input)
    return true
  } catch {
    return false
  }
}

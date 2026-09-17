import LinkifyIt from 'linkify-it'

export type HyperlinkSource =
  | 'command'
  | 'autolink'
  | 'paste'
  | 'markdown'
  | 'parse'
  | 'render'
  | 'navigate'
  | 'copy'

export interface HyperlinkContext {
  source?: HyperlinkSource
}

export type HyperlinkKind = 'url' | 'email' | 'phone' | 'relative' | 'protocol'

export type HyperlinkFailureReason =
  | 'empty'
  | 'too_long'
  | 'unsafe_scheme'
  | 'unsupported_scheme'
  | 'invalid_url'
  | 'invalid_email'
  | 'invalid_phone'
  | 'rejected'

export interface AcceptedHyperlink {
  ok: true
  input: string
  href: string
  kind: HyperlinkKind
}

export interface RejectedHyperlink {
  ok: false
  reason: HyperlinkFailureReason
}

export type HyperlinkDecision = AcceptedHyperlink | RejectedHyperlink

export interface HyperlinkMatch extends AcceptedHyperlink {
  from: number
  to: number
  text: string
}

export interface HyperlinkProtocol {
  scheme: string
  validate?: RegExp | ((href: string, context: HyperlinkContext) => boolean)
  normalize?: (href: string) => string
  autolink?: boolean
}

export interface HyperlinkPolicyOptions {
  defaultProtocol?: 'http' | 'https'
  allowRelative?: boolean
  allowProtocolRelative?: boolean
  maxLength?: number
  detect?: {
    urls?: boolean
    emails?: boolean
    phones?: boolean
  }
  protocols?: readonly HyperlinkProtocol[]
  validate?: (decision: AcceptedHyperlink, context: HyperlinkContext) => boolean
  shouldAutoLink?: (decision: AcceptedHyperlink, context: HyperlinkContext) => boolean
}

export interface HyperlinkPolicy {
  normalize(input: string, context?: HyperlinkContext): HyperlinkDecision
  find(text: string, context?: HyperlinkContext): readonly HyperlinkMatch[]
}

const DEFAULT_MAX_LENGTH = 2048
const SCHEME_RE = /^([a-z][a-z\d+.-]*):/i
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\ufeff]/u
const WHITESPACE_RE = /\p{White_Space}/u
const PHONE_RE = /^\+[\d\s().-]+$/u
const EMAIL_LOCAL_RE = /^[A-Za-z0-9._+-]+$/u
const PHONE_MATCH_RE = /(^|[^\p{L}\p{N}])(\+[\d\s().-]*\d)(?=$|[^\p{L}\p{N}])/gu
const CUSTOM_PROTOCOL_TAIL_RE = /^(?:\/\/)?[^\s<>{}\[\]]+/u
const DANGEROUS_SCHEMES = new Set(['blob', 'data', 'file', 'javascript', 'vbscript'])

interface ResolvedOptions {
  defaultProtocol: 'http' | 'https'
  allowRelative: boolean
  allowProtocolRelative: boolean
  maxLength: number
  detect: {
    urls: boolean
    emails: boolean
    phones: boolean
  }
  protocols: ReadonlyMap<string, HyperlinkProtocol>
  validate?: HyperlinkPolicyOptions['validate']
  shouldAutoLink?: HyperlinkPolicyOptions['shouldAutoLink']
}

export function createHyperlinkPolicy(options: HyperlinkPolicyOptions = {}): HyperlinkPolicy {
  const protocols = new Map<string, HyperlinkProtocol>()
  for (const protocol of options.protocols ?? []) {
    const scheme = protocol.scheme.trim().replace(/:$/, '').toLowerCase()
    if (!scheme || DANGEROUS_SCHEMES.has(scheme) || ['http', 'https', 'mailto', 'tel'].includes(scheme)) {
      continue
    }
    protocols.set(scheme, {...protocol, scheme})
  }

  const resolved: ResolvedOptions = {
    defaultProtocol: options.defaultProtocol ?? 'https',
    allowRelative: options.allowRelative ?? true,
    allowProtocolRelative: options.allowProtocolRelative ?? false,
    maxLength: options.maxLength ?? DEFAULT_MAX_LENGTH,
    detect: {
      urls: options.detect?.urls ?? true,
      emails: options.detect?.emails ?? true,
      phones: options.detect?.phones ?? true,
    },
    protocols,
    validate: options.validate,
    shouldAutoLink: options.shouldAutoLink,
  }

  const linkify = createDetector(resolved)

  function normalize(input: string, context: HyperlinkContext = {}): HyperlinkDecision {
    const value = input.trim()
    if (!value) return reject('empty')
    if (value.length > resolved.maxLength) return reject('too_long')

    const schemeProbe = value.replace(/[\p{White_Space}\u0000-\u001f\u007f-\u009f\ufeff]/gu, '')
    const probedScheme = SCHEME_RE.exec(schemeProbe)?.[1]?.toLowerCase()
    if (probedScheme && DANGEROUS_SCHEMES.has(probedScheme)) return reject('unsafe_scheme')
    if (CONTROL_RE.test(value) || value.includes('\\')) return reject('invalid_url')

    const phone = normalizePhone(value)
    if (phone) return accept({input: value, href: phone, kind: 'phone'}, context, resolved)

    const schemeMatch = SCHEME_RE.exec(value)
    if (schemeMatch?.[1].toLowerCase() === 'tel') {
      const payload = value.slice(schemeMatch[0].length)
      const explicitPhone = payload.startsWith('+') ? normalizePhone(payload) : null
      return explicitPhone
        ? accept({input: value, href: explicitPhone, kind: 'phone'}, context, resolved)
        : reject('invalid_phone')
    }

    if (WHITESPACE_RE.test(value)) return reject('invalid_url')

    if (schemeMatch) {
      const scheme = schemeMatch[1].toLowerCase()
      if (DANGEROUS_SCHEMES.has(scheme)) return reject('unsafe_scheme')

      if (scheme === 'http' || scheme === 'https') {
        return validateWebUrl(value)
          ? accept({input: value, href: value, kind: 'url'}, context, resolved)
          : reject('invalid_url')
      }
      if (scheme === 'mailto') {
        const address = value.slice(schemeMatch[0].length).split('?', 1)[0]
        return validateEmail(address)
          ? accept({input: value, href: value, kind: 'email'}, context, resolved)
          : reject('invalid_email')
      }
      const protocol = resolved.protocols.get(scheme)
      if (!protocol) return reject('unsupported_scheme')
      if (!value.slice(schemeMatch[0].length)) return reject('invalid_url')
      if (!passesProtocol(protocol, value, context)) return reject('rejected')

      const href = protocol.normalize?.(value) ?? value
      const normalizedScheme = SCHEME_RE.exec(href)?.[1]?.toLowerCase()
      if (
        !normalizedScheme ||
        normalizedScheme !== scheme ||
        href.length > resolved.maxLength ||
        CONTROL_RE.test(href) ||
        WHITESPACE_RE.test(href) ||
        href.includes('\\')
      ) {
        return reject('rejected')
      }
      return accept({input: value, href, kind: 'protocol'}, context, resolved)
    }

    if (value.startsWith('//')) {
      if (!resolved.allowProtocolRelative) return reject('invalid_url')
      return validateWebUrl(`${resolved.defaultProtocol}:${value}`)
        ? accept({input: value, href: value, kind: 'url'}, context, resolved)
        : reject('invalid_url')
    }

    if (/^(?:\.?\.?\/|[?#])/u.test(value)) {
      return resolved.allowRelative
        ? accept({input: value, href: value, kind: 'relative'}, context, resolved)
        : reject('invalid_url')
    }

    if (validateEmail(value)) {
      return accept({input: value, href: `mailto:${value}`, kind: 'email'}, context, resolved)
    }

    if (exactMatch(linkify, value, '') || validateWebUrl(`https://${value}`)) {
      const href = `${resolved.defaultProtocol}://${value}`
      return validateWebUrl(href)
        ? accept({input: value, href, kind: 'url'}, context, resolved)
        : reject('invalid_url')
    }

    return reject('invalid_url')
  }

  function find(text: string, context: HyperlinkContext = {source: 'autolink'}): readonly HyperlinkMatch[] {
    if (!text || text.length > resolved.maxLength * 4) return []

    const matches: HyperlinkMatch[] = []
    for (const match of linkify.match(text) ?? []) {
      if (match.schema === '//' && !resolved.allowProtocolRelative) continue
      if (match.schema === 'mailto:' && !resolved.detect.emails) continue
      if (match.schema !== 'mailto:' && !resolved.detect.urls) continue

      const decision = normalize(match.raw, context)
      if (!decision.ok || (resolved.shouldAutoLink && !resolved.shouldAutoLink(decision, context))) continue
      matches.push({...decision, from: match.index, to: match.lastIndex, text: match.raw})
    }

    if (resolved.detect.phones) {
      for (const match of text.matchAll(PHONE_MATCH_RE)) {
        const prefix = match[1] ?? ''
        const visible = match[2]
        if (!visible) continue
        const from = (match.index ?? 0) + prefix.length
        const to = from + visible.length
        if (matches.some(candidate => from < candidate.to && candidate.from < to)) continue

        const decision = normalize(visible, context)
        if (!decision.ok || (resolved.shouldAutoLink && !resolved.shouldAutoLink(decision, context))) continue
        matches.push({...decision, from, to, text: visible})
      }
    }

    return matches.sort((left, right) => left.from - right.from || right.to - left.to)
  }

  return {
    normalize,
    find,
  }
}

function createDetector(options: ResolvedOptions): LinkifyIt {
  const detector = new LinkifyIt(undefined, {
    fuzzyEmail: options.detect.emails,
    fuzzyIP: false,
    fuzzyLink: options.detect.urls,
  })
  detector.add('ftp:', null)

  for (const protocol of options.protocols.values()) {
    if (protocol.autolink === false) continue
    detector.add(`${protocol.scheme}:`, {validate: CUSTOM_PROTOCOL_TAIL_RE})
  }
  return detector
}

function accept(
  decision: Omit<AcceptedHyperlink, 'ok'>,
  context: HyperlinkContext,
  options: ResolvedOptions,
): HyperlinkDecision {
  const accepted: AcceptedHyperlink = {ok: true, ...decision}
  return options.validate && !options.validate(accepted, context) ? reject('rejected') : accepted
}

function reject(reason: HyperlinkFailureReason): RejectedHyperlink {
  return {ok: false, reason}
}

function hasSafeUnicodeHostnameCharacters(value: string): boolean {
  return Array.from(value).every(character =>
    /^[\x00-\x7f]$/u.test(character) ||
    /^[\p{L}\p{M}\u3002\uff0e\uff61]$/u.test(character)
  )
}

function validateEmail(value: string): boolean {
  if (value.length > 254 || value.split('@').length !== 2) return false
  const [local = '', domain = ''] = value.split('@')
  if (
    !local ||
    local.length > 64 ||
    local.startsWith('.') ||
    local.endsWith('.') ||
    local.includes('..') ||
    !EMAIL_LOCAL_RE.test(local) ||
    domain.includes('%') ||
    !hasSafeUnicodeHostnameCharacters(domain)
  ) return false

  if (/^[\x00-\x7f]+$/u.test(domain)) return isPlausibleHostname(domain)
  try {
    const url = new URL(`https://${domain}`)
    return url.pathname === '/' && !url.search && !url.hash && isPlausibleHostname(url.hostname)
  } catch {
    return false
  }
}

function normalizePhone(value: string): string | null {
  if (!PHONE_RE.test(value)) return null
  const digits = value.replace(/\D/g, '')
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null
  return `tel:+${digits}`
}

function validateWebUrl(value: string): boolean {
  const scheme = /^https?:\/\//iu.exec(value)
  if (!scheme) return false

  const authority = value.slice(scheme[0].length).split(/[/?#]/u, 1)[0] ?? ''
  if (
    !authority ||
    authority.includes('%') ||
    authority.includes('@') ||
    !hasSafeUnicodeHostnameCharacters(authority)
  ) return false

  const bracketed = authority.startsWith('[')
  const rawHostname = bracketed
    ? authority.slice(0, authority.indexOf(']') + 1)
    : authority.split(':', 1)[0] ?? ''
  if (!rawHostname) return false
  if (!bracketed && /^[\x00-\x7f]+$/u.test(rawHostname) && !isPlausibleHostname(rawHostname)) {
    return false
  }

  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return false
    if (!url.hostname || url.username || url.password) return false
    return isPlausibleHostname(url.hostname)
  } catch {
    return false
  }
}

function isPlausibleHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/u, '')
  if (host === 'localhost') return true
  if (/^\[[\da-f:]+\]$/iu.test(host)) return true
  if (/^\d+(?:\.\d+){3}$/u.test(host)) {
    return host.split('.').every(part => String(Number(part)) === part && Number(part) <= 255)
  }
  if (host.length > 253) return false

  const labels = host.split('.')
  return labels.length >= 2 && labels.every(label =>
    label.length > 0 &&
    label.length <= 63 &&
    /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/u.test(label)
  )
}

function exactMatch(linkify: LinkifyIt, value: string, schema?: string): boolean {
  const matches = linkify.match(value)
  return Boolean(
    matches?.length === 1 &&
      matches[0].index === 0 &&
      matches[0].lastIndex === value.length &&
      (!schema || matches[0].schema === schema),
  )
}

function passesProtocol(
  protocol: HyperlinkProtocol,
  href: string,
  context: HyperlinkContext,
): boolean {
  if (!protocol.validate) return true
  if (protocol.validate instanceof RegExp) {
    protocol.validate.lastIndex = 0
    return protocol.validate.test(href)
  }
  return protocol.validate(href, context)
}

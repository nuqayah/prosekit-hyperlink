import {
  MarkdownParser,
  MarkdownSerializer,
  type MarkdownSerializerState,
  type ParseSpec,
} from 'prosemirror-markdown'
import type {Mark, Node as ProseMirrorNode} from 'prosekit/pm/model'

import {
  createHyperlinkPolicy,
  type HyperlinkPolicy,
  type HyperlinkPolicyOptions,
} from './policy.js'

export interface HyperlinkMarkdownOptions {
  policy?: HyperlinkPolicy
  policyOptions?: HyperlinkPolicyOptions
  defaultAttributes?: Record<string, unknown>
}

type MarkdownToken = ReturnType<MarkdownParser['tokenizer']['parse']>[number]
type MarkSerializerSpec = MarkdownSerializer['marks'][string]

/**
 * Wrap an existing parser without mutating it. Link tokens are normalized
 * before ProseMirror sees them; rejected links keep their visible content but
 * lose the mark.
 */
export function createHyperlinkMarkdownParser(
  base: MarkdownParser,
  options: HyperlinkMarkdownOptions = {},
): MarkdownParser {
  const policy = resolvePolicy(options)
  const tokenizer = new Proxy(base.tokenizer, {
    get(target, property, receiver) {
      // Parse every syntactically valid destination first, then let the package
      // policy remove rejected marks. This preserves the visible label instead
      // of leaving unsafe link syntax literal in the document.
      if (property === 'validateLink') return () => true
      if (property === 'parse') {
        return (text: string, environment: object = {}) => {
          const tokens = Reflect.apply(target.parse, receiver, [text, environment])
          sanitizeTokens(tokens, policy)
          return tokens
        }
      }
      const value = Reflect.get(target, property, receiver) as unknown
      return typeof value === 'function' ? value.bind(receiver) : value
    },
  })

  return new MarkdownParser(base.schema, tokenizer, {
    ...base.tokens,
    link: createHyperlinkMarkdownParseSpec(policy, options.defaultAttributes),
  })
}

/** Build the `link` token spec for a custom parser composition. */
export function createHyperlinkMarkdownParseSpec(
  policy: HyperlinkPolicy = createHyperlinkPolicy(),
  defaultAttributes: Record<string, unknown> = {},
): ParseSpec {
  return {
    mark: 'link',
    getAttrs(token) {
      const decision = policy.normalize(token.attrGet('href') ?? '', {
        source: 'markdown',
      })
      if (!decision.ok) {
        throw new RangeError('Rejected link token reached the sanitized parser spec')
      }
      return {
        ...defaultAttributes,
        href: decision.href,
        title: token.attrGet('title') || null,
      }
    },
  }
}

/** Replace only the link mark serializer in an existing composition. */
export function createHyperlinkMarkdownSerializer(
  base: MarkdownSerializer,
  options: HyperlinkMarkdownOptions = {},
): MarkdownSerializer {
  return new MarkdownSerializer(
    base.nodes,
    {
      ...base.marks,
      link: createHyperlinkMarkdownMarkSpec(resolvePolicy(options)),
    },
    base.options,
  )
}

/** Build the link mark serializer for a custom serializer composition. */
export function createHyperlinkMarkdownMarkSpec(
  policy: HyperlinkPolicy = createHyperlinkPolicy(),
): MarkSerializerSpec {
  const autolinkStates = new WeakMap<MarkdownSerializerState, boolean>()
  return {
    open(state, mark, parent, index) {
      const decision = readDecision(policy, mark)
      if (!decision) return ''
      const autolink = isPlainUrl(mark, parent, index, decision.href)
      autolinkStates.set(state, autolink)
      return autolink ? '<' : '['
    },
    close(state, mark) {
      const decision = readDecision(policy, mark)
      const autolink = autolinkStates.get(state) ?? false
      autolinkStates.delete(state)
      if (!decision) return ''
      if (autolink) return '>'

      const title = typeof mark.attrs.title === 'string' && mark.attrs.title
        ? ` "${escapeTitle(mark.attrs.title)}"`
        : ''
      return `](${escapeDestination(decision.href)}${title})`
    },
    mixable: true,
  }
}

function resolvePolicy(options: HyperlinkMarkdownOptions): HyperlinkPolicy {
  if (options.policy && options.policyOptions) {
    throw new TypeError('Pass policy or policyOptions, not both')
  }
  return options.policy ?? createHyperlinkPolicy(options.policyOptions)
}

function sanitizeTokens(tokens: readonly MarkdownToken[], policy: HyperlinkPolicy): void {
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    if (!token) continue
    if (token.children) sanitizeTokens(token.children, policy)
    if (token.type !== 'link_open') continue

    const decision = policy.normalize(token.attrGet('href') ?? '', {
      source: 'markdown',
    })
    if (decision.ok) {
      token.attrSet('href', decision.href)
      continue
    }

    neutralize(token)
    let depth = 1
    for (let closeIndex = index + 1; closeIndex < tokens.length; closeIndex++) {
      const candidate = tokens[closeIndex]
      if (!candidate) continue
      if (candidate.type === 'link_open') depth++
      if (candidate.type !== 'link_close' || --depth !== 0) continue
      neutralize(candidate)
      break
    }
  }
}

function neutralize(token: MarkdownToken): void {
  token.type = 'text'
  token.tag = ''
  token.nesting = 0
  token.attrs = null
  token.content = ''
  token.markup = ''
  token.children = null
}

function readDecision(policy: HyperlinkPolicy, mark: Mark) {
  const href = typeof mark.attrs.href === 'string' ? mark.attrs.href : ''
  const decision = policy.normalize(href, {source: 'render'})
  return decision.ok ? decision : null
}

function isPlainUrl(
  mark: Mark,
  parent: ProseMirrorNode,
  index: number,
  href: string,
): boolean {
  if (mark.attrs.title || !/^[a-z][a-z\d+.-]*:/iu.test(href)) return false
  const content = parent.child(index)
  if (!content.isText || content.text !== href) return false
  if (content.marks[content.marks.length - 1] !== mark) return false
  return index === parent.childCount - 1 || !mark.isInSet(parent.child(index + 1).marks)
}

function escapeDestination(href: string): string {
  return href.replace(/[\s()<>]/gu, character =>
    `%${character.codePointAt(0)!.toString(16).toUpperCase().padStart(2, '0')}`
  )
}

function escapeTitle(title: string): string {
  return title.replace(/["\\]/gu, '\\$&')
}

import {
  defineCommands,
  defineMarkSpec,
  Priority,
  union,
  withPriority,
} from 'prosekit/core'
import type {Attrs, Mark, MarkType, Slice} from 'prosekit/pm/model'
import {TextSelection, type Command} from 'prosekit/pm/state'

import {defineHyperlinkInteractions} from './interactions.js'
import {
  createHyperlinkPolicy,
  type HyperlinkPolicy,
  type HyperlinkPolicyOptions,
} from './policy.js'
import {getActiveLink, isSimpleTextRange, selectionAllowsMark} from './range.js'
import {defineHyperlinkState} from './state.js'

export {getActiveLink, type ActiveHyperlinkRange} from './range.js'

export interface LinkAttrs extends Attrs {
  href: string
  target: string | null
  rel: string | null
}

export interface SetLinkAttrs extends Partial<Omit<LinkAttrs, 'href'>> {
  href: string
  [key: string]: unknown
}

export interface UpdateLinkOptions {
  href?: string
  text?: string
  attrs?: Record<string, unknown>
}

export type HyperlinkPasteTransform = (slice: Slice) => Slice

export interface HyperlinkOptions {
  policy?: HyperlinkPolicy
  policyOptions?: HyperlinkPolicyOptions
  allowLegacyHref?: boolean
  defaultAttributes?: Partial<Omit<LinkAttrs, 'href'>>
  HTMLAttributes?: Record<string, string | null>
  shortcut?: string | false
  autolink?: boolean
  markdownShortcut?: boolean
  linkOnPaste?: boolean
  transformPastedSlice?: HyperlinkPasteTransform
  openOnClick?: boolean
  selectOnClick?: boolean
  exitable?: boolean
}

interface ResolvedHyperlinkOptions {
  policy: HyperlinkPolicy
  allowLegacyHref: boolean
  defaultAttributes: Omit<LinkAttrs, 'href'>
  HTMLAttributes: Record<string, string | null>
  shortcut: string | false
  autolink: boolean
  markdownShortcut: boolean
  linkOnPaste: boolean
  transformPastedSlice?: HyperlinkPasteTransform
  openOnClick: boolean
  selectOnClick: boolean
  exitable: boolean
}

export function defineHyperlink(options: HyperlinkOptions = {}) {
  const resolved = resolveOptions(options)
  return union(defineResolvedHyperlinkSpec(resolved), defineResolvedHyperlinkBehavior(resolved))
}

export type HyperlinkExtension = ReturnType<typeof defineHyperlink>

function defineResolvedHyperlinkSpec(resolved: ResolvedHyperlinkOptions) {
  const {policy, allowLegacyHref, defaultAttributes, HTMLAttributes} = resolved
  return defineMarkSpec<'link', LinkAttrs>({
    name: 'link',
    inclusive: false,
    attrs: {
      href: allowLegacyHref
        ? {validate: 'string'}
        : {
            validate(value) {
              if (typeof value !== 'string' || !isCanonicalHref(policy, value)) {
                throw new RangeError('Invalid hyperlink href')
              }
            },
          },
      target: {default: defaultAttributes.target, validate: 'string|null'},
      rel: {default: defaultAttributes.rel, validate: 'string|null'},
    },
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs(dom: HTMLElement) {
          const rawHref = dom.getAttribute('href') ?? ''
          const decision = policy.normalize(rawHref, {source: 'parse'})
          if (!decision.ok) return false
          return {
            href: decision.href,
            target: dom.getAttribute('target'),
            rel: dom.getAttribute('rel'),
          }
        },
      },
    ],
    toDOM(mark) {
      const attrs = mark.attrs as LinkAttrs
      const decision = policy.normalize(attrs.href, {source: 'render'})
      if (!decision.ok) return ['span', {'data-hyperlink-invalid': ''}, 0]

      const target = attrs.target ?? HTMLAttributes.target ?? null
      const rel = safeRel(target, attrs.rel ?? HTMLAttributes.rel ?? null)
      return [
        'a',
        compactAttributes({
          ...HTMLAttributes,
          href: decision.href,
          target,
          rel,
        }),
        0,
      ]
    },
  })
}

function defineResolvedHyperlinkBehavior(resolved: ResolvedHyperlinkOptions) {
  const {policy, defaultAttributes} = resolved
  return union(
    defineCommands({
      addLink: (attrs: SetLinkAttrs, text?: string) =>
        addLinkCommand(policy, defaultAttributes, attrs, text),
      removeLink: () => removeLinkCommand(),
      toggleLink: (attrs: SetLinkAttrs, text?: string) =>
        toggleLinkCommand(policy, defaultAttributes, attrs, text),
      expandLink: () => expandLinkCommand(),
      updateLink: (update: UpdateLinkOptions) => updateLinkCommand(policy, update),
    }),
    defineHyperlinkState({shortcut: resolved.shortcut, policy}),
    withPriority(
      defineHyperlinkInteractions({
        policy,
        defaultAttributes,
        autolink: resolved.autolink,
        markdownShortcut: resolved.markdownShortcut,
        linkOnPaste: resolved.linkOnPaste,
        transformPastedSlice: resolved.transformPastedSlice,
        openOnClick: resolved.openOnClick,
        selectOnClick: resolved.selectOnClick,
        exitable: resolved.exitable,
      }),
      Priority.high,
    ),
  )
}

function resolveOptions(options: HyperlinkOptions): ResolvedHyperlinkOptions {
  if (options.policy && options.policyOptions) {
    throw new TypeError('Pass policy or policyOptions, not both')
  }
  const defaults = options.defaultAttributes ?? {}
  return {
    policy: options.policy ?? createHyperlinkPolicy(options.policyOptions),
    allowLegacyHref: options.allowLegacyHref ?? false,
    defaultAttributes: {
      ...defaults,
      target: defaults.target ?? null,
      rel: defaults.rel ?? null,
    },
    HTMLAttributes: options.HTMLAttributes ?? {},
    shortcut: options.shortcut ?? 'Mod-k',
    autolink: options.autolink ?? true,
    markdownShortcut: options.markdownShortcut ?? true,
    linkOnPaste: options.linkOnPaste ?? true,
    transformPastedSlice: options.transformPastedSlice,
    openOnClick: options.openOnClick ?? true,
    selectOnClick: options.selectOnClick ?? false,
    exitable: options.exitable ?? false,
  }
}

function addLinkCommand(
  policy: HyperlinkPolicy,
  defaults: Omit<LinkAttrs, 'href'>,
  input: SetLinkAttrs,
  text?: string,
): Command {
  return (state, dispatch) => {
    const type = state.schema.marks.link
    const decision = policy.normalize(input.href, {source: 'command'})
    if (!type || !decision.ok) return false
    const mark = createValidatedMark(type, {
      ...defaults,
      ...input,
      href: decision.href,
    })
    if (!mark) return false

    const {from, to, empty} = state.selection
    if (!selectionAllowsMark(state, type)) return false

    if (!empty) {
      dispatch?.(state.tr.addMark(from, to, mark))
      return true
    }

    const label = text ?? input.href.trim()
    if (!label) return false
    if (dispatch) {
      const end = from + label.length
      const tr = state.tr.insertText(label, from).addMark(from, end, mark)
      dispatch(tr.setSelection(TextSelection.create(tr.doc, end)))
    }
    return true
  }
}

function removeLinkCommand(): Command {
  return (state, dispatch) => {
    const type = state.schema.marks.link
    if (!type) return false

    const range = state.selection.empty
      ? getActiveLink(state)
      : state.doc.rangeHasMark(state.selection.from, state.selection.to, type)
        ? {from: state.selection.from, to: state.selection.to}
        : null
    if (!range) return false

    dispatch?.(state.tr.removeMark(range.from, range.to, type))
    return true
  }
}

function toggleLinkCommand(
  policy: HyperlinkPolicy,
  defaults: Omit<LinkAttrs, 'href'>,
  attrs: SetLinkAttrs,
  text?: string,
): Command {
  return (state, dispatch, view) => {
    const type = state.schema.marks.link
    if (!type) return false
    const hasLink = state.selection.empty
      ? Boolean(getActiveLink(state))
      : state.doc.rangeHasMark(state.selection.from, state.selection.to, type)
    return (hasLink ? removeLinkCommand() : addLinkCommand(policy, defaults, attrs, text))(
      state,
      dispatch,
      view,
    )
  }
}

function expandLinkCommand(): Command {
  return (state, dispatch) => {
    const range = getActiveLink(state)
    if (!range || (range.from === state.selection.from && range.to === state.selection.to)) return false
    dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, range.from, range.to)))
    return true
  }
}

function updateLinkCommand(policy: HyperlinkPolicy, update: UpdateLinkOptions): Command {
  return (state, dispatch) => {
    const range = getActiveLink(state)
    const type = state.schema.marks.link
    if (!range || !type) return false

    const href = update.href ?? String(range.mark.attrs.href ?? '')
    const decision = policy.normalize(href, {source: 'command'})
    if (!decision.ok) return false

    const attrs = {
      ...range.mark.attrs,
      ...update.attrs,
      href: decision.href,
    }
    const nextMark = createValidatedMark(type, attrs)
    if (!nextMark) return false

    if (update.text !== undefined) {
      if (!update.text || !isSimpleTextRange(state.doc, range.from, range.to)) return false
      if (update.text !== state.doc.textBetween(range.from, range.to, '', '')) {
        if (dispatch) {
          const node = state.doc.nodeAt(range.from)
          if (!node?.isText) return false
          const marks = node.marks.filter(mark => mark.type !== type)
          const text = state.schema.text(update.text, [...marks, nextMark])
          dispatch(state.tr.replaceWith(range.from, range.to, text))
        }
        return true
      }
    }

    if (nextMark.eq(range.mark)) return true
    dispatch?.(
      state.tr
        .removeMark(range.from, range.to, type)
        .addMark(range.from, range.to, nextMark),
    )
    return true
  }
}

function createValidatedMark(type: MarkType, attrs: Attrs): Mark | null {
  try {
    return type.schema.markFromJSON({type: type.name, attrs})
  } catch {
    return null
  }
}

function isCanonicalHref(policy: HyperlinkPolicy, href: string): boolean {
  const decision = policy.normalize(href, {source: 'render'})
  return decision.ok && decision.href === href
}

function safeRel(target: string | null, rel: string | null): string | null {
  if (target?.toLowerCase() !== '_blank') return rel
  const tokens = new Set((rel ?? '').toLowerCase().split(/\s+/).filter(Boolean))
  tokens.delete('opener')
  tokens.add('noopener')
  tokens.add('noreferrer')
  return [...tokens].join(' ')
}

function compactAttributes(attributes: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(attributes)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== ''),
  )
}

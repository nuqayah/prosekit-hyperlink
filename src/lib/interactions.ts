import {
  defineClickHandler,
  defineKeyDownHandler,
  definePasteHandler,
  definePlugin,
  defineTextInputHandler,
  union,
  type ClickHandler,
  type KeyDownHandler,
  type PasteHandler,
  type PlainExtension,
} from 'prosekit/core'
import {defineEnterRule} from 'prosekit/extensions/enter-rule'
import {defineInputRule} from 'prosekit/extensions/input-rule'
import {InputRule} from 'prosekit/pm/inputrules'
import {
  Fragment,
  Mark,
  Slice,
  type Attrs,
  type MarkType,
  type ProseMirrorNode,
} from 'prosekit/pm/model'
import {Plugin, PluginKey, TextSelection, type EditorState, type Transaction} from 'prosekit/pm/state'

import type {HyperlinkPasteTransform, LinkAttrs} from './hyperlink.js'
import type {HyperlinkPolicy} from './policy.js'
import {getActiveLink, selectionAllowsMark} from './range.js'
import {hyperlinkPluginKey, normalizeHyperlinkHref, type HyperlinkUIState} from './state.js'

export interface HyperlinkInteractionOptions {
  policy: HyperlinkPolicy
  defaultAttributes: Omit<LinkAttrs, 'href'>
  autolink: boolean
  markdownShortcut: boolean
  linkOnPaste: boolean
  transformPastedSlice?: HyperlinkPasteTransform
  openOnClick: boolean
  selectOnClick: boolean
  exitable: boolean
}

const AUTOLINK_INPUT_RE = /([\s\S]{1,500})(\s)$/u
const AUTOLINK_ENTER_RE = /[\s\S]{1,200}$/u
const TRAILING_PUNCTUATION_RE = /^[.,;:!?…)}\]”’'"»]*$/u
const MARKDOWN_LINK_RE = /(^|[^!])(\[([^\]\n]+)\]\(([^()\s]+)\))$/u

interface AutomaticLinkRange {
  from: number
  to: number
  href: string
}

const automaticLinkPluginKey = new PluginKey<AutomaticLinkRange[]>(
  'prosekit-hyperlink-automatic',
)

export function defineHyperlinkInteractions(
  options: HyperlinkInteractionOptions,
): PlainExtension {
  const extensions: PlainExtension[] = [definePasteHandler(createPasteHandler(options))]

  if (options.openOnClick) {
    extensions.push(defineClickHandler(createLinkClickHandler(options)))
  }

  if (options.autolink) {
    extensions.push(
      definePlugin(createAutomaticLinkPlugin()),
      defineTextInputHandler((view, from, to, inserted) => {
        const range = findAutomaticEditRange(view.state, from, to)
        if (!range) return false
        const transaction = view.state.tr.insertText(inserted, from, to)
        view.dispatch(reconcileAutomaticRange(view.state, transaction, range, options))
        return true
      }),
      defineInputRule(createAutolinkInputRule(options)),
      defineEnterRule({
        regex: AUTOLINK_ENTER_RE,
        stop: false,
        handler: ({state, from, match}) =>
          addTrailingDetectedMark(state, state.tr, from, match[0], options),
      }),
    )
  }

  if (options.autolink || options.exitable) {
    extensions.push(defineKeyDownHandler(createHyperlinkKeyDownHandler(options)))
  }

  if (options.markdownShortcut) {
    extensions.push(defineInputRule(createMarkdownLinkInputRule(options)))
  }

  return union(extensions) as PlainExtension
}

function createLinkClickHandler(options: HyperlinkInteractionOptions): ClickHandler {
  return (view, position, event) => {
    if (
      !view.editable ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey ||
      event.defaultPrevented
    ) {
      return false
    }

    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
    if (!anchor || !view.dom.contains(anchor)) return false

    const active = getActiveLink(view.state, position)
    const href = active && normalizeHyperlinkHref(view.state, active.mark.attrs.href, 'navigate')
    if (!active || !href) return false

    event.preventDefault()
    let transaction = view.state.tr
    if (options.selectOnClick) {
      transaction = transaction.setSelection(
        TextSelection.create(transaction.doc, active.from, active.to),
      )
    }

    const next: Exclude<HyperlinkUIState, {mode: 'closed'}> = {
      mode: 'preview',
      range: {from: active.from, to: active.to},
      attrs: {...active.mark.attrs, href},
      text: view.state.doc.textBetween(active.from, active.to, ' ', ' '),
      trigger: 'click',
    }
    view.dispatch(transaction.setMeta(hyperlinkPluginKey, next))
    return true
  }
}

function createAutolinkInputRule(options: HyperlinkInteractionOptions): InputRule {
  return new InputRule(
    AUTOLINK_INPUT_RE,
    (state, match, start, end) => {
      const source = match[1]
      const boundary = match[2]
      if (!source || !boundary) return null

      const tr = addTrailingDetectedMark(state, state.tr, start, source, options)
      if (!tr) return null
      return tr.insertText(boundary, end)
    },
    {inCodeMark: false},
  )
}

function createMarkdownLinkInputRule(options: HyperlinkInteractionOptions): InputRule {
  return new InputRule(
    MARKDOWN_LINK_RE,
    (state, match, start, end) => {
      const prefix = match[1] ?? ''
      const label = match[3]
      const rawHref = match[4]
      if (!label || !rawHref) return null

      const decision = options.policy.normalize(rawHref, {source: 'markdown'})
      const type = state.schema.marks.link
      if (!decision.ok || !type) return null

      const mark = createValidatedMark(type, {
        ...options.defaultAttributes,
        href: decision.href,
      })
      const syntaxStart = start + prefix.length
      const parent = state.doc.resolve(syntaxStart).parent
      if (!mark || !parent.type.allowsMarkType(type)) return null

      const marks = uniformMarks(state.doc, syntaxStart, end, type)
      if (!marks) return null
      const text = state.schema.text(label, mark.addToSet(marks))
      return state.tr.replaceWith(syntaxStart, end, text)
    },
    {inCodeMark: false},
  )
}

function addTrailingDetectedMark(
  state: EditorState,
  transaction: Transaction,
  textStart: number,
  text: string,
  options: HyperlinkInteractionOptions,
): Transaction | null {
  const type = state.schema.marks.link
  const candidate = findTrailingCandidate(text, options)
  if (!type || !candidate) return null

  const from = textStart + candidate.from
  const to = textStart + candidate.to
  if (from >= to || state.doc.rangeHasMark(from, to, type)) return null
  if (rangeHasCodeMark(state.doc, from, to)) return null

  const mark = createValidatedMark(type, {
    ...options.defaultAttributes,
    href: candidate.href,
  })
  if (!mark || !state.doc.resolve(from).parent.type.allowsMarkType(type)) return null
  return transaction
    .addMark(from, to, mark)
    .setMeta(automaticLinkPluginKey, {from, to, href: candidate.href} satisfies AutomaticLinkRange)
}

function createAutomaticLinkPlugin(): Plugin<AutomaticLinkRange[]> {
  return new Plugin<AutomaticLinkRange[]>({
    key: automaticLinkPluginKey,
    state: {
      init: () => [],
      apply(transaction, previous, _oldState, newState) {
        const type = newState.schema.marks.link
        if (!type) return []

        const ranges = previous
          .map(range => mapAutomaticRange(range, transaction))
          .filter(
            (range): range is AutomaticLinkRange =>
              Boolean(range && automaticRangeStillLinked(newState, type, range)),
          )
        const added = transaction.getMeta(automaticLinkPluginKey) as
          | AutomaticLinkRange
          | undefined
        if (added && automaticRangeStillLinked(newState, type, added)) ranges.push(added)
        return ranges
      },
    },
  })
}

function createHyperlinkKeyDownHandler(
  options: HyperlinkInteractionOptions,
): KeyDownHandler {
  return (view, event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false

    if (options.autolink && (event.key === 'Backspace' || event.key === 'Delete')) {
      const deletion = automaticDeletion(view.state, event.key)
      if (deletion) {
        const transaction = view.state.tr.delete(deletion.from, deletion.to)
        view.dispatch(
          reconcileAutomaticRange(view.state, transaction, deletion.range, options),
        )
        return true
      }
    }

    if (options.exitable && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      return exitLinkAtEdge(view, event.key)
    }
    return false
  }
}

function reconcileAutomaticRange(
  state: EditorState,
  transaction: Transaction,
  range: AutomaticLinkRange,
  options: HyperlinkInteractionOptions,
): Transaction {
  const mapped = mapAutomaticRange(range, transaction)
  const type = state.schema.marks.link
  if (!mapped || !type) return transaction

  const text = transaction.doc.textBetween(mapped.from, mapped.to, ' ', ' ')
  const candidate = options.policy
    .find(text, {source: 'autolink'})
    .find(match => match.from === 0 && match.to === text.length)
  const current = type.isInSet(transaction.doc.nodeAt(mapped.from)?.marks ?? [])

  if (!candidate || !current) {
    return transaction.removeMark(mapped.from, mapped.to, type)
  }

  if (candidate.href === range.href) return transaction

  const mark = createValidatedMark(type, {
    ...current.attrs,
    href: candidate.href,
  })
  if (!mark) return transaction.removeMark(mapped.from, mapped.to, type)

  return transaction
    .removeMark(mapped.from, mapped.to, type)
    .addMark(mapped.from, mapped.to, mark)
    .setMeta(automaticLinkPluginKey, {
      ...mapped,
      href: candidate.href,
    } satisfies AutomaticLinkRange)
}

function mapAutomaticRange(
  range: AutomaticLinkRange,
  transaction: Transaction,
): AutomaticLinkRange | null {
  const from = transaction.mapping.mapResult(range.from, 1)
  const to = transaction.mapping.mapResult(range.to, -1)
  if (from.deletedAcross || to.deletedAcross || from.pos >= to.pos) return null
  return {from: from.pos, to: to.pos, href: range.href}
}

function findAutomaticEditRange(
  state: EditorState,
  from: number,
  to: number,
): AutomaticLinkRange | null {
  return (automaticLinkPluginKey.getState(state) ?? []).find(range =>
    from === to
      ? from > range.from && from < range.to
      : from >= range.from && to <= range.to
  ) ?? null
}

function automaticDeletion(
  state: EditorState,
  key: 'Backspace' | 'Delete',
): {from: number; to: number; range: AutomaticLinkRange} | null {
  const {selection} = state
  const ranges = automaticLinkPluginKey.getState(state) ?? []

  if (!selection.empty) {
    const range = ranges.find(candidate =>
      selection.from >= candidate.from && selection.to <= candidate.to,
    )
    return range ? {from: selection.from, to: selection.to, range} : null
  }

  const position = selection.from
  const range = ranges.find(candidate =>
    key === 'Backspace'
      ? position > candidate.from && position <= candidate.to
      : position >= candidate.from && position < candidate.to,
  )
  if (!range) return null

  if (key === 'Backspace') {
    const previous = Array.from(state.doc.textBetween(range.from, position, '', '')).at(-1)
    return {from: position - (previous?.length ?? 1), to: position, range}
  }
  const next = Array.from(state.doc.textBetween(position, range.to, '', ''))[0]
  return {from: position, to: position + (next?.length ?? 1), range}
}

function exitLinkAtEdge(
  view: Parameters<KeyDownHandler>[0],
  key: 'ArrowLeft' | 'ArrowRight',
): boolean {
  const {selection} = view.state
  if (!selection.empty) return false

  const active = getActiveLink(view.state, selection.from)
  if (!active) return false
  const atEdge = key === 'ArrowLeft'
    ? selection.from === active.from
    : selection.from === active.to
  if (!atEdge) return false

  const type = view.state.schema.marks.link
  if (!type) return false
  const marks = (view.state.storedMarks ?? selection.$from.marks())
    .filter(mark => mark.type !== type)
  view.dispatch(view.state.tr.setStoredMarks(marks))
  return false
}

function automaticRangeStillLinked(
  state: EditorState,
  type: MarkType,
  range: AutomaticLinkRange,
): boolean {
  if (range.from < 0 || range.to > state.doc.content.size || range.from >= range.to) {
    return false
  }
  let sawText = false
  let valid = true
  state.doc.nodesBetween(range.from, range.to, node => {
    if (!node.isText) return valid
    sawText = true
    const mark = node.marks.find(candidate => candidate.type === type)
    if (!mark || mark.attrs.href !== range.href) valid = false
    return valid
  })
  return sawText && valid
}

function findTrailingCandidate(text: string, options: HyperlinkInteractionOptions) {
  const matches = options.policy.find(text, {source: 'autolink'})
  for (let index = matches.length - 1; index >= 0; index--) {
    const candidate = matches[index]
    if (
      candidate &&
      TRAILING_PUNCTUATION_RE.test(text.slice(candidate.to)) &&
      !isMarkdownDestination(text, candidate.from)
    ) return candidate
  }
  return null
}

function createPasteHandler(options: HyperlinkInteractionOptions): PasteHandler {
  return (view, event, slice) => {
    if (!options.linkOnPaste) return false

    const clipboard = event.clipboardData
    if (clipboard?.files.length) return false
    const html = clipboard?.getData('text/html') ?? ''
    if (
      Array.from(clipboard?.types ?? []).includes('application/x-prosemirror') ||
      html.includes('data-pm-slice')
    ) return false

    const state = view.state
    if (clipboard && !state.selection.empty) {
      const raw = clipboard.getData('text/plain').trim()
      const decision = options.policy.normalize(raw, {source: 'paste'})
      const type = state.schema.marks.link
      const mark = decision.ok && type
        ? createValidatedMark(type, {...options.defaultAttributes, href: decision.href})
        : null

      if (raw && mark && type && selectionAllowsMark(state, type)) {
        const {from, to} = state.selection
        if (rangeHasCodeMark(state.doc, from, to)) return false
        view.dispatch(
          state.tr
            .addMark(from, to, mark)
            .setMeta('paste', true)
            .setMeta('uiEvent', 'paste'),
        )
        return true
      }
    }

    const type = state.schema.marks.link
    if (
      state.selection.$from.parent.type.spec.code ||
      !type ||
      !state.selection.$from.parent.type.allowsMarkType(type)
    ) return false

    const prepared = options.transformPastedSlice?.(slice) ?? slice
    const content = transformFragment(prepared.content, type, options, true)
    if (!content && prepared === slice) return false
    const replacement = content
      ? new Slice(content, prepared.openStart, prepared.openEnd)
      : prepared

    view.dispatch(
      state.tr
        .replaceSelection(replacement)
        .scrollIntoView()
        .setMeta('paste', true)
        .setMeta('uiEvent', 'paste'),
    )
    return true
  }
}

function transformFragment(
  fragment: Fragment,
  type: MarkType,
  options: HyperlinkInteractionOptions,
  allowTextMarks: boolean,
): Fragment | null {
  let changed = false
  const children: ProseMirrorNode[] = []

  fragment.forEach(node => {
    const replacement = transformNode(node, type, options, allowTextMarks)
    if (replacement) changed = true
    children.push(...(replacement ?? [node]))
  })

  return changed ? Fragment.fromArray(children) : null
}

function transformNode(
  node: ProseMirrorNode,
  type: MarkType,
  options: HyperlinkInteractionOptions,
  allowTextMarks: boolean,
): ProseMirrorNode[] | null {
  if (node.type.spec.code) return null

  if (node.isText) {
    if (
      !allowTextMarks ||
      !node.text ||
      node.marks.some(mark => mark.type === type || mark.type.spec.code)
    ) return null
    return linkifyTextNode(node, type, options)
  }

  if (node.isLeaf) return null
  const content = transformFragment(node.content, type, options, node.type.allowsMarkType(type))
  return content ? [node.copy(content)] : null
}

function linkifyTextNode(
  node: ProseMirrorNode,
  type: MarkType,
  options: HyperlinkInteractionOptions,
): ProseMirrorNode[] | null {
  const text = node.text ?? ''
  const matches = options.policy
    .find(text, {source: 'paste'})
    .filter(match => !isMarkdownDestination(text, match.from))
  if (!matches.length) return null

  const nodes: ProseMirrorNode[] = []
  let offset = 0
  let changed = false
  for (const match of matches) {
    if (match.from < offset || match.from >= match.to) continue
    if (offset < match.from) nodes.push(node.type.schema.text(text.slice(offset, match.from), node.marks))

    const mark = createValidatedMark(type, {
      ...options.defaultAttributes,
      href: match.href,
    })
    const marks = mark ? mark.addToSet(node.marks) : node.marks
    nodes.push(node.type.schema.text(text.slice(match.from, match.to), marks))
    if (mark) changed = true
    offset = match.to
  }

  if (!changed) return null
  if (offset < text.length) nodes.push(node.type.schema.text(text.slice(offset), node.marks))
  return nodes
}

function uniformMarks(
  doc: ProseMirrorNode,
  from: number,
  to: number,
  excluded: MarkType,
): readonly Mark[] | null {
  let expected: readonly Mark[] | undefined
  let uniform = true
  doc.nodesBetween(from, to, node => {
    if (!node.isText) return uniform
    const marks = node.marks.filter(mark => mark.type !== excluded)
    if (!expected) expected = marks
    else if (!Mark.sameSet(expected, marks)) uniform = false
    return uniform
  })
  return uniform ? (expected ?? []) : null
}

function createValidatedMark(type: MarkType, attrs: Attrs): Mark | null {
  try {
    return type.schema.markFromJSON({type: type.name, attrs})
  } catch {
    return null
  }
}

function rangeHasCodeMark(doc: ProseMirrorNode, from: number, to: number): boolean {
  let found = false
  doc.nodesBetween(from, to, node => {
    if (node.marks.some(mark => mark.type.spec.code)) found = true
    return !found
  })
  return found
}

function isMarkdownDestination(text: string, offset: number): boolean {
  return /!?\[[^\]]*\]\($/u.test(text.slice(0, offset))
}

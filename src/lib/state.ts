import {
  defineCommands,
  defineKeymap,
  definePlugin,
  union,
  type Extension,
} from 'prosekit/core'
import {
  Plugin,
  PluginKey,
  type Command,
  type EditorState,
  type Transaction,
} from 'prosekit/pm/state'

import {
  createHyperlinkPolicy,
  type HyperlinkPolicy,
} from './policy.js'
import {getActiveLink, selectionAllowsMark} from './range.js'

export type HyperlinkPopoverMode = 'create' | 'preview' | 'edit'
export type HyperlinkPopoverTrigger = 'keyboard' | 'toolbar' | 'click' | 'programmatic'

export interface HyperlinkRange {
  from: number
  to: number
}

export type HyperlinkUIState =
  | {mode: 'closed'}
  | {
      mode: HyperlinkPopoverMode
      range: HyperlinkRange
      attrs: Record<string, unknown>
      text: string
      trigger: HyperlinkPopoverTrigger
    }

export interface OpenLinkPopoverOptions {
  mode?: HyperlinkPopoverMode
  attrs?: Record<string, unknown>
  trigger?: HyperlinkPopoverTrigger
}

export interface HyperlinkStateOptions {
  shortcut?: string | false
  policy?: HyperlinkPolicy
}

export type HyperlinkStateExtension = Extension<{
  Commands: {
    openLinkPopover: [options?: OpenLinkPopoverOptions]
    closeLinkPopover: []
  }
}>

const CLOSED_STATE: HyperlinkUIState = Object.freeze({mode: 'closed'})

export const hyperlinkPluginKey = new PluginKey<HyperlinkUIState>('prosekit-hyperlink')
const hyperlinkPolicyPluginKey = new PluginKey<HyperlinkPolicy>('prosekit-hyperlink-policy')

export function getHyperlinkState(state: EditorState): HyperlinkUIState {
  return hyperlinkPluginKey.getState(state) ?? CLOSED_STATE
}

export function getHyperlinkPolicy(state: EditorState): HyperlinkPolicy | null {
  return hyperlinkPolicyPluginKey.getState(state) ?? null
}

export function defineHyperlinkState(
  {
    shortcut = 'Mod-k',
    policy = createHyperlinkPolicy(),
  }: HyperlinkStateOptions = {},
): HyperlinkStateExtension {
  const extensions = [
    definePlugin([
      createHyperlinkStatePlugin(),
      new Plugin<HyperlinkPolicy>({
        key: hyperlinkPolicyPluginKey,
        state: {init: () => policy, apply: () => policy},
      }),
    ]),
    defineCommands({
      openLinkPopover: (options?: OpenLinkPopoverOptions) => openLinkPopoverCommand(options),
      closeLinkPopover: () => closeLinkPopoverCommand(),
    }),
  ]

  const keymap: Record<string, Command> = {
    Escape: closeLinkPopoverCommand(),
  }
  if (shortcut) keymap[shortcut] = openLinkPopoverCommand({trigger: 'keyboard'})
  extensions.push(defineKeymap(keymap))

  return union(extensions) as HyperlinkStateExtension
}

function createHyperlinkStatePlugin(): Plugin<HyperlinkUIState> {
  return new Plugin<HyperlinkUIState>({
    key: hyperlinkPluginKey,
    state: {
      init: () => CLOSED_STATE,
      apply(transaction, previous, _oldState, newState) {
        const next = transaction.getMeta(hyperlinkPluginKey) as HyperlinkUIState | undefined
        if (next) return next
        if (previous.mode === 'closed' || !transaction.docChanged) return previous
        return mapOpenState(transaction, previous, newState)
      },
    },
  })
}

function openLinkPopoverCommand(options: OpenLinkPopoverOptions = {}): Command {
  return (state, dispatch) => {
    const active = getActiveLink(state)
    const mode = options.mode ?? (active ? 'edit' : 'create')
    if (mode !== 'create' && !active) return false
    const type = state.schema.marks.link
    if (mode === 'create' && (!type || !selectionAllowsMark(state, type))) return false

    const range = mode === 'create'
      ? {from: state.selection.from, to: state.selection.to}
      : {from: active!.from, to: active!.to}
    const attrs = {
      ...(mode === 'create' ? null : active!.mark.attrs),
      ...options.attrs,
    }
    if (mode === 'preview') {
      const href = normalizeHyperlinkHref(state, attrs.href, 'navigate')
      if (!href) return false
      attrs.href = href
    }
    const next: Exclude<HyperlinkUIState, {mode: 'closed'}> = {
      mode,
      range,
      attrs,
      text: state.doc.textBetween(range.from, range.to, ' ', ' '),
      trigger: options.trigger ?? 'programmatic',
    }

    dispatch?.(state.tr.setMeta(hyperlinkPluginKey, next))
    return true
  }
}

function closeLinkPopoverCommand(): Command {
  return (state, dispatch) => {
    if (getHyperlinkState(state).mode === 'closed') return false
    dispatch?.(state.tr.setMeta(hyperlinkPluginKey, CLOSED_STATE))
    return true
  }
}

function mapOpenState(
  transaction: Transaction,
  previous: Exclude<HyperlinkUIState, {mode: 'closed'}>,
  newState: EditorState,
): HyperlinkUIState {
  const collapsed = previous.range.from === previous.range.to
  const mappedFrom = transaction.mapping.mapResult(previous.range.from, 1)
  const mappedTo = transaction.mapping.mapResult(previous.range.to, collapsed ? 1 : -1)
  if (
    mappedFrom.deletedAcross ||
    mappedTo.deletedAcross ||
    mappedFrom.pos > mappedTo.pos ||
    mappedTo.pos > newState.doc.content.size
  ) {
    return CLOSED_STATE
  }

  if (previous.mode === 'create') {
    const range = {from: mappedFrom.pos, to: mappedTo.pos}
    return {
      ...previous,
      range,
      text: newState.doc.textBetween(range.from, range.to, ' ', ' '),
    }
  }

  const probe = mappedFrom.pos < mappedTo.pos ? mappedFrom.pos + 1 : mappedFrom.pos
  const active = getActiveLink(newState, probe) ?? getActiveLink(newState, mappedTo.pos)
  if (!active) return CLOSED_STATE

  const attrs = {...active.mark.attrs}
  if (previous.mode === 'preview') {
    const href = normalizeHyperlinkHref(newState, attrs.href, 'navigate')
    if (!href) return CLOSED_STATE
    attrs.href = href
  }
  return {
    ...previous,
    range: {from: active.from, to: active.to},
    attrs,
    text: newState.doc.textBetween(active.from, active.to, ' ', ' '),
  }
}

export function normalizeHyperlinkHref(
  state: EditorState,
  href: unknown,
  source: 'copy' | 'navigate',
): string | null {
  if (typeof href !== 'string') return null
  const decision = getHyperlinkPolicy(state)?.normalize(href, {source})
  return decision?.ok ? decision.href : null
}

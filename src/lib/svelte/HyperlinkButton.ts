import type {Editor} from 'prosekit/core'
import type {Component, Snippet} from 'svelte'
import type {HTMLButtonAttributes} from 'svelte/elements'

import ComponentImpl from './HyperlinkButton.svelte'

export interface HyperlinkButtonSnippetContext {
  active: boolean
}

export type HyperlinkButtonProps = Omit<
  HTMLButtonAttributes,
  'children' | 'class' | 'disabled' | 'onclick' | 'onmousedown' | 'title'
> & {
  editor?: Editor
  label?: string
  activeLabel?: string
  class?: string
  disabled?: boolean
  title?: string
  children?: Snippet<[HyperlinkButtonSnippetContext]>
}

export const HyperlinkButton = ComponentImpl as Component<HyperlinkButtonProps>

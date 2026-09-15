<script lang="ts">
  import {untrack} from 'svelte'

  import {useHyperlink} from './use-hyperlink.svelte.js'

  import type {HyperlinkButtonProps} from './HyperlinkButton.js'

  let {
    editor,
    label = 'Add link',
    activeLabel = 'Edit link',
    class: className = '',
    disabled = false,
    title,
    children,
    ...rest
  }: HyperlinkButtonProps = $props()

  const hyperlink = untrack(() => useHyperlink(editor))
  const hyperlinkState = hyperlink.state
  const currentLabel = $derived($hyperlinkState.active ? activeLabel : label)

  function open() {
    if (disabled) return
    if ($hyperlinkState.active) hyperlink.openEdit()
    else hyperlink.openCreate({trigger: 'toolbar'})
  }
</script>

<button
  {...rest}
  type="button"
  class={['pkh-button', className]}
  aria-label={currentLabel}
  aria-pressed={$hyperlinkState.active}
  aria-haspopup="dialog"
  {disabled}
  title={title ?? currentLabel}
  onmousedown={(event) => event.preventDefault()}
  onclick={open}
>
  {#if children}
    {@render children({active: $hyperlinkState.active})}
  {:else}
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10.6 13.4a2 2 0 0 0 2.8 0l3-3a2 2 0 1 0-2.8-2.8l-1.1 1.1" />
      <path d="M13.4 10.6a2 2 0 0 0-2.8 0l-3 3a2 2 0 1 0 2.8 2.8l1.1-1.1" />
    </svg>
  {/if}
</button>

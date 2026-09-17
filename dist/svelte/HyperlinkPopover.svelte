<script lang="ts">
  import {
    arrow,
    autoUpdate,
    computePosition,
    flip,
    hide,
    offset,
    shift,
    size,
  } from '@floating-ui/dom'
  import {tick, untrack} from 'svelte'

  import {createRangeReference, portal} from './floating.js'
  import {
    resolveHyperlinkMessages,
    type HyperlinkMessageOverrides,
  } from './messages.js'
  import {useHyperlink} from './use-hyperlink.svelte.js'

  import type {HyperlinkPopoverProps} from './HyperlinkPopover.js'

  let {
    editor,
    messages: messageOverrides = {},
    class: className = '',
    dir,
    placement = 'bottom',
    portalTarget,
    showArrow = true,
  }: HyperlinkPopoverProps = $props()

  const hyperlink = untrack(() => useHyperlink(editor))
  const hyperlinkState = hyperlink.state
  const messages = $derived(resolveHyperlinkMessages(messageOverrides))

  let popover = $state<HTMLElement>()
  let arrowElement = $state<HTMLElement>()
  let urlInput = $state<HTMLInputElement>()
  let href = $state('')
  let text = $state('')
  let error = $state('')
  let copied = $state(false)
  let copyTimer: ReturnType<typeof setTimeout> | undefined
  let formKey = ''
  const componentId = $props.id()
  const errorId = `${componentId}-error`

  const open = $derived($hyperlinkState.mode !== 'closed')
  const editing = $derived($hyperlinkState.mode === 'edit')
  const previewing = $derived($hyperlinkState.mode === 'preview')
  const dialogLabel = $derived(editing ? messages.editLink : messages.addLink)

  $effect(() => {
    const state = $hyperlinkState
    const nextKey = state.mode === 'closed'
      ? 'closed'
      : `${state.mode}:${state.range.from}:${state.range.to}:${state.href}:${state.text}`
    if (nextKey === formKey) return

    formKey = nextKey
    href = state.href
    text = state.text
    error = ''
    copied = false

    if (state.mode === 'create' || state.mode === 'edit') {
      tick().then(() => {
        if (formKey === nextKey) urlInput?.focus()
      })
    }
  })

  $effect(() => {
    const state = $hyperlinkState
    const floating = popover
    const arrowNode = arrowElement
    if (state.mode === 'closed' || !floating || !hyperlink.editor.mounted) return

    const reference = createRangeReference(hyperlink.editor, state.range)
    if (!reference) {
      hyperlink.close()
      return
    }

    let disposed = false
    const update = async () => {
      const middleware = [
        offset(8),
        flip({padding: 8}),
        shift({padding: 8}),
        size({
          padding: 8,
          apply({availableWidth, availableHeight}) {
            Object.assign(floating.style, {
              maxWidth: `${Math.max(0, availableWidth)}px`,
              maxHeight: `${Math.max(0, availableHeight)}px`,
            })
          },
        }),
        hide(),
      ]
      if (showArrow && arrowNode) middleware.push(arrow({element: arrowNode, padding: 8}))

      const result = await computePosition(reference, floating, {
        placement,
        strategy: 'fixed',
        middleware,
      })
      if (disposed) return
      const hidden = Boolean(result.middlewareData.hide?.referenceHidden)
      Object.assign(floating.style, {
        left: `${result.x}px`,
        top: `${result.y}px`,
        visibility: hidden ? 'hidden' : 'visible',
      })
      floating.dataset.side = result.placement.split('-')[0]

      if (arrowNode && result.middlewareData.arrow) {
        const {x, y} = result.middlewareData.arrow
        Object.assign(arrowNode.style, {
          left: x == null ? '' : `${x}px`,
          top: y == null ? '' : `${y}px`,
        })
      }
    }

    const stop = autoUpdate(reference, floating, update)
    return () => {
      disposed = true
      stop()
    }
  })

  $effect(() => {
    const element = popover
    if (!open || !element) return

    const controller = new AbortController()
    const dismiss = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && element.contains(target)) return
      hyperlink.close()
    }
    element.ownerDocument.addEventListener('pointerdown', dismiss, {
      capture: true,
      signal: controller.signal,
    })
    return () => controller.abort()
  })

  $effect(() => () => {
    if (copyTimer) clearTimeout(copyTimer)
  })

  function submit(event: SubmitEvent) {
    event.preventDefault()
    const result = hyperlink.apply({
      href,
      text: $hyperlinkState.canSetText ? text : undefined,
    })
    if (result.applied) return
    error = result.decision.ok
      ? messages.failures.rejected
      : messages.failures[result.decision.reason]
  }

  async function copy() {
    copied = await hyperlink.copy()
    if (!copied) return
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => (copied = false), 1600)
  }

  function cancel() {
    hyperlink.close()
    if (hyperlink.editor.mounted) hyperlink.editor.focus()
  }

  function keydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    cancel()
  }
</script>

{#if open}
  <div
    bind:this={popover}
    use:portal={portalTarget}
    class={['pkh-popover', className]}
    style="position: fixed; left: 0; top: 0"
    {dir}
    role={previewing ? 'toolbar' : 'dialog'}
    aria-label={previewing ? messages.linkDetails : dialogLabel}
    onkeydown={keydown}
  >
    {#if previewing}
      <div class="pkh-preview">
        <button
          type="button"
          class="pkh-destination"
          title={$hyperlinkState.href}
          onclick={() => hyperlink.navigate()}
        >
          <span dir="ltr">{$hyperlinkState.href}</span>
        </button>
        <div class="pkh-actions">
          <button type="button" class="pkh-icon-button" onclick={() => hyperlink.navigate()}>
            <span class="pkh-visually-hidden">{messages.open}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 5h5v5" />
              <path d="m10 14 9-9" />
              <path d="M19 13v6H5V5h6" />
            </svg>
          </button>
          <button type="button" class="pkh-icon-button" onclick={copy}>
            <span class="pkh-visually-hidden">{copied ? messages.copied : messages.copy}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="9" y="9" width="10" height="10" rx="2" />
              <path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
            </svg>
          </button>
          <button type="button" class="pkh-icon-button" onclick={() => hyperlink.openEdit()}>
            <span class="pkh-visually-hidden">{messages.editLink}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m4 20 4.2-1 10-10a2.1 2.1 0 0 0-3-3l-10 10Z" />
              <path d="m13.5 7.5 3 3" />
            </svg>
          </button>
          <button type="button" class="pkh-icon-button pkh-danger" onclick={() => hyperlink.unlink()}>
            <span class="pkh-visually-hidden">{messages.unlink}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 15 6-6" />
              <path d="M7.5 7.5 5.6 9.4a3.7 3.7 0 0 0 5.2 5.2l1.1-1.1" />
              <path d="m16.5 16.5 1.9-1.9a3.7 3.7 0 0 0-5.2-5.2l-1.1 1.1" />
            </svg>
          </button>
        </div>
        {#if copied}<span class="pkh-status" aria-live="polite">{messages.copied}</span>{/if}
      </div>
    {:else}
      <form class="pkh-form" onsubmit={submit}>
        <div class="pkh-heading">
          {#if editing}
            <button type="button" class="pkh-back" onclick={() => hyperlink.openPreview()}>
              <span aria-hidden="true">←</span>
              <span class="pkh-visually-hidden">{messages.back}</span>
            </button>
          {/if}
          <strong>{dialogLabel}</strong>
        </div>

        {#if $hyperlinkState.canSetText}
          <label class="pkh-field">
            <span>{messages.text}</span>
            <input bind:value={text} autocomplete="off" />
          </label>
        {/if}

        <label class="pkh-field">
          <span>{messages.url}</span>
          <input
            bind:this={urlInput}
            bind:value={href}
            dir="ltr"
            inputmode="url"
            autocomplete="url"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
          />
        </label>

        {#if error}
          <p id={errorId} class="pkh-error" role="alert">{error}</p>
        {/if}

        <div class="pkh-form-actions">
          <button type="button" class="pkh-secondary" onclick={cancel}>
            {messages.cancel}
          </button>
          <button type="submit" class="pkh-primary">{messages.apply}</button>
        </div>
      </form>
    {/if}

    {#if showArrow}<span bind:this={arrowElement} class="pkh-arrow" aria-hidden="true"></span>{/if}
  </div>
{/if}

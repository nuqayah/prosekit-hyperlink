<script lang="ts">
  import {createEditor} from 'prosekit/core'

  import {defineBasicExtensionWithHyperlink} from '@nuqayah/prosekit-hyperlink/basic'
  import {communicationProtocols} from '@nuqayah/prosekit-hyperlink/protocols'
  import {
    HyperlinkButton,
    HyperlinkPopover,
    useHyperlink,
    type HyperlinkMessageOverrides,
  } from '@nuqayah/prosekit-hyperlink/svelte'

  const extension = defineBasicExtensionWithHyperlink({
    policyOptions: {
      protocols: communicationProtocols,
    },
  })

  const editor = createEditor({
    extension,
    defaultContent: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {type: 'text', text: 'Select text and press '},
            {type: 'text', marks: [{type: 'code'}], text: 'Mod-K'},
            {type: 'text', text: ' to create a link.'},
          ],
        },
        {
          type: 'paragraph',
          content: [
            {type: 'text', text: 'Try typing example.com, person@example.com, or +1 202 555 0100 and then press Space.'},
          ],
        },
        {
          type: 'paragraph',
          content: [
            {type: 'text', text: 'Click this '},
            {
              type: 'text',
              text: 'existing link',
              marks: [
                {
                  type: 'link',
                  attrs: {
                    href: 'https://prosekit.dev',
                    target: null,
                    rel: null,
                    title: 'ProseKit',
                  },
                },
              ],
            },
            {type: 'text', text: ' to preview, edit, copy, or unlink it.'},
          ],
        },
      ],
    },
  })

  const hyperlink = useHyperlink(editor)
  const hyperlinkState = hyperlink.state

  let editorElement = $state<HTMLDivElement>()
  let dark = $state(false)
  let rtl = $state(false)

  const arabicMessages: HyperlinkMessageOverrides = {
    addLink: 'إضافة رابط',
    editLink: 'تعديل الرابط',
    linkDetails: 'تفاصيل الرابط',
    url: 'الرابط',
    text: 'النص',
    apply: 'تطبيق',
    cancel: 'إلغاء',
    back: 'رجوع',
    open: 'فتح',
    copy: 'نسخ',
    copied: 'نُسخ الرابط',
    unlink: 'إزالة الرابط',
  }

  $effect(() => {
    const element = editorElement
    if (!element) return
    editor.mount(element)
    return () => editor.unmount()
  })
</script>

<svelte:head>
  <meta
    name="description"
    content="A standalone, safe hyperlink extension for ProseKit with polished Svelte UI."
  />
</svelte:head>

<main class={['demo-shell', dark && 'theme-dark']} dir={rtl ? 'rtl' : 'ltr'}>
  <header class="hero">
    <div>
      <p class="eyebrow">Standalone ProseKit extension</p>
      <h1>Hyperlinks that feel finished.</h1>
      <p class="lede">
        Safe URL decisions, local autolinking, paste handling, keyboard commands, and a complete
        Svelte interface in one reusable package.
      </p>
    </div>

    <div class="display-controls" aria-label="Demo display settings">
      <button type="button" onclick={() => (dark = !dark)}>
        {dark ? 'Light' : 'Dark'}
      </button>
      <button type="button" onclick={() => (rtl = !rtl)}>
        {rtl ? 'LTR' : 'RTL'}
      </button>
    </div>
  </header>

  <section class="editor-card" aria-label="Hyperlink editor demo">
    <div class="toolbar" role="toolbar" aria-label="Editor toolbar">
      <HyperlinkButton
        {editor}
        label={rtl ? 'إضافة رابط' : 'Add link'}
        activeLabel={rtl ? 'تعديل الرابط' : 'Edit link'}
      />
      <span class="toolbar-note">Select text or place the caret, then use the link button or Mod-K.</span>
    </div>

    <div bind:this={editorElement} class="editor prosekit-typography"></div>

    <HyperlinkPopover
      {editor}
      dir={rtl ? 'rtl' : 'ltr'}
      messages={rtl ? arabicMessages : undefined}
    />
  </section>

  <section class="headless-card">
    <div>
      <p class="eyebrow">The same public hook powers custom UI</p>
      <h2>Headless state</h2>
      <p>
        Mode: <code>{$hyperlinkState.mode}</code>
        · Active: <code>{$hyperlinkState.active ? 'yes' : 'no'}</code>
      </p>
      {#if $hyperlinkState.href}
        <p class="current-href" dir="ltr">{$hyperlinkState.href}</p>
      {/if}
    </div>

    <div class="headless-actions">
      <button type="button" onclick={() => hyperlink.openCreate({trigger: 'toolbar'})}>
        Open from custom control
      </button>
      {#if $hyperlinkState.active}
        <button type="button" onclick={() => hyperlink.openEdit()}>Edit active link</button>
        <button type="button" class="danger" onclick={() => hyperlink.unlink()}>Unlink</button>
      {/if}
    </div>
  </section>
</main>

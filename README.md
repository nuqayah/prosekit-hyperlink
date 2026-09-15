# @nuqayah/prosekit-hyperlink

A standalone hyperlink extension for ProseKit with safe URL handling and an optional, polished Svelte 5 interface.

It covers the behavior that usually accumulates around a link mark:

- Autolinking for domains, email addresses, international phone numbers, and configured protocols
- `Mod-K` creation and editing
- Link selected text by pasting one destination
- Linkification inside ordinary plain-text and rich-content paste
- Create, preview, edit, copy, open, and unlink actions
- Safe parsing, rendering, commands, paste, clipboard, and navigation
- Per-editor protocol policies with no process-global registry
- Local-input autolinking that does not turn remote collaborative edits into local work
- Optional light/dark, RTL-aware Svelte UI or a fully custom interface through `useHyperlink()`

The package is currently under active development and has not been published.

## Install

```sh
pnpm add @nuqayah/prosekit-hyperlink prosekit
```

For the prebuilt Svelte interface:

```sh
pnpm add svelte @floating-ui/dom
```

Both are optional peers; headless consumers do not install or load the Svelte positioning layer.

## Svelte quick start

ProseKit's regular `defineBasicExtension()` already includes its native link extension. Use `defineBasicExtensionWithHyperlink()` instead; do not install both link implementations.

```svelte
<script lang="ts">
  import {createEditor} from 'prosekit/core'
  import {defineBasicExtensionWithHyperlink} from '@nuqayah/prosekit-hyperlink/basic'
  import {
    HyperlinkButton,
    HyperlinkPopover,
  } from '@nuqayah/prosekit-hyperlink/svelte'

  import '@nuqayah/prosekit-hyperlink/styles.css'
  import 'prosekit/basic/style.css'
  import 'prosekit/basic/typography.css'

  const editor = createEditor({
    extension: defineBasicExtensionWithHyperlink(),
    defaultContent: '<p>Select some text, then press Mod-K.</p>',
  })

  let editorElement = $state<HTMLDivElement>()

  $effect(() => {
    if (!editorElement) return
    editor.mount(editorElement)
    return () => editor.unmount()
  })
</script>

<div role="toolbar" aria-label="Editor toolbar">
  <HyperlinkButton {editor} />
</div>

<div bind:this={editorElement} class="prosekit-typography"></div>
<HyperlinkPopover {editor} />
```

The stylesheet is optional. Without it, the components retain their semantic markup and behavior but no default visual treatment.

The `./svelte` entry contains Svelte components and is consumed through a Svelte-aware bundler. The core, basic, protocol, and Markdown entry points remain directly importable in Node.

## Custom ProseKit composition

For an editor that already owns its schema composition, omit ProseKit's native `defineLink()` and add this schema-owning extension directly:

```ts
import {union} from 'prosekit/core'
import {defineDoc} from 'prosekit/extensions/doc'
import {defineParagraph} from 'prosekit/extensions/paragraph'
import {defineText} from 'prosekit/extensions/text'
import {defineHyperlink} from '@nuqayah/prosekit-hyperlink'

const extension = union(
  defineDoc(),
  defineParagraph(),
  defineText(),
  defineHyperlink(),
)
```

Applications can add persisted attributes with ProseKit's normal `defineMarkAttr({type: 'link', ...})` composition. Href-only edits preserve the complete existing mark attributes.

## Options

```ts
interface HyperlinkOptions {
  policy?: HyperlinkPolicy
  policyOptions?: HyperlinkPolicyOptions
  allowLegacyHref?: boolean           // default: false
  defaultAttributes?: Partial<Omit<LinkAttrs, 'href'>>
  HTMLAttributes?: Record<string, string | null>
  shortcut?: string | false          // default: 'Mod-k'
  autolink?: boolean                 // default: true
  markdownShortcut?: boolean         // default: true
  linkOnPaste?: boolean              // default: true
  transformPastedSlice?: HyperlinkPasteTransform
  openOnClick?: boolean              // default: true
  selectOnClick?: boolean            // default: false
  exitable?: boolean                 // default: false
}
```

Pass either `policy` or `policyOptions`; supplying both throws.

`allowLegacyHref` keeps noncanonical href strings in existing PM JSON loadable during a migration. Commands and pasted HTML still use the configured policy; rendering normalizes accepted destinations and emits unsafe values as inert text.

`markdownShortcut` converts typed `[label](destination)` syntax. It is an authoring shortcut, not a bundled whole-document Markdown codec.

`transformPastedSlice` is a slice-returning transform for sanitizing or otherwise changing external paste before hyperlink detection. If it returns a different slice, that slice is inserted even when it contains no link candidate. It is called only where the destination accepts link marks, and not for file or internal ProseMirror paste.

## URL policy and application protocols

The safety floor cannot be bypassed by a custom validator. It rejects executable/local-resource schemes, browser-obfuscated schemes, controls, malformed web authorities, unsafe backslash forms, and oversized input before host callbacks run.

```ts
import {createHyperlinkPolicy} from '@nuqayah/prosekit-hyperlink'
import {defineBasicExtensionWithHyperlink} from '@nuqayah/prosekit-hyperlink/basic'
import {
  communicationProtocols,
  getApplicationLinkInfo,
} from '@nuqayah/prosekit-hyperlink/protocols'

const policy = createHyperlinkPolicy({
  protocols: communicationProtocols,
  validate: decision => !decision.href.includes('blocked.example'),
  shouldAutoLink: decision => decision.kind !== 'protocol',
})

const extension = defineBasicExtensionWithHyperlink({policy})
const info = getApplicationLinkInfo('whatsapp://send?text=Hello')
```

Each policy owns its own `linkify-it` instance. Two editors on the same page may safely use different protocol sets.

## Fully custom Svelte UI

`useHyperlink()` exposes the complete public workflow used by the prebuilt components:

```svelte
<script lang="ts">
  import {useHyperlink} from '@nuqayah/prosekit-hyperlink/svelte'

  let {editor} = $props()
  const hyperlink = useHyperlink(editor)
  const hyperlinkState = hyperlink.state
</script>

<button onclick={() => hyperlink.openCreate({trigger: 'toolbar'})}>
  Add link
</button>

{#if $hyperlinkState.active}
  <button onclick={() => hyperlink.openEdit()}>Edit</button>
  <button onclick={() => hyperlink.unlink()}>Unlink</button>
{/if}
```

The hook also provides `apply()`, `copy()`, `navigate()`, `openPreview()`, and `close()`.

## Commands

The extension preserves ProseKit's familiar link command family and adds editing/UI commands:

```ts
editor.commands.addLink({href: 'example.com'})
editor.commands.removeLink()
editor.commands.toggleLink({href: 'https://example.com'})
editor.commands.expandLink()
editor.commands.updateLink({href: 'new.example', text: 'New label'})
editor.commands.openLinkPopover({mode: 'create'})
editor.commands.closeLinkPopover()
```

All explicit destination writes normalize and validate before mutation. Invalid commands return `false` without changing the document.

## Markdown documents

The core extension includes the typed `[label](destination)` authoring shortcut. Full document import/export is available as an optional adapter for `prosemirror-markdown`:

```sh
pnpm add prosemirror-markdown
```

```ts
import {
  createHyperlinkMarkdownParser,
  createHyperlinkMarkdownSerializer,
} from '@nuqayah/prosekit-hyperlink/markdown'

const parser = createHyperlinkMarkdownParser(baseParser, {policy})
const serializer = createHyperlinkMarkdownSerializer(baseSerializer, {policy})
```

The adapter wraps an existing parser or serializer without mutating it. Tokenized destinations rejected by policy keep their label but lose the mark; syntax rejected by the Markdown tokenizer remains literal. Unsafe legacy marks serialize as plain text.

## Collaboration behavior

Autolinking runs from local typing, Enter, and paste. It is not implemented as an unconditional transaction appender, so receiving remote URL-shaped text does not create a second local collaborative obligation.

## Theming and localization

Default visuals use namespaced `--pkh-*` custom properties. Override them on any ancestor, or omit the stylesheet and supply your own classes/snippets.

`HyperlinkPopover` accepts partial message overrides and an explicit `dir`. URL fields remain LTR-isolated inside RTL interfaces.

## Development

```sh
pnpm install
pnpm validate
pnpm demo:dev
```

The runnable demo includes the prebuilt interface, theme and direction toggles, and a small custom-UI example powered by `useHyperlink()`.

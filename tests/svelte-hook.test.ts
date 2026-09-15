import {createEditor, union, type NodeJSON} from 'prosekit/core'
import {defineDoc} from 'prosekit/extensions/doc'
import {defineParagraph} from 'prosekit/extensions/paragraph'
import {defineText} from 'prosekit/extensions/text'
import {TextSelection} from 'prosekit/pm/state'
import {get} from 'svelte/store'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {defineHyperlink, type HyperlinkOptions} from '../src/lib/index.js'
import {useHyperlink} from '../src/lib/svelte/index.js'

function createHyperlinkEditor(
  content: NodeJSON,
  anchor = 1,
  head = anchor,
  options: HyperlinkOptions = {},
) {
  return createEditor({
    extension: union(defineDoc(), defineParagraph(), defineText(), defineHyperlink(options)),
    defaultContent: content,
    defaultSelection: {type: 'text', anchor, head},
  })
}

const paragraph = (text: string): NodeJSON => ({
  type: 'doc',
  content: [{type: 'paragraph', content: text ? [{type: 'text', text}] : undefined}],
})

const linkedParagraph = (text: string, href: string): NodeJSON => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text,
          marks: [{type: 'link', attrs: {href, target: null, rel: null}}],
        },
      ],
    },
  ],
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useHyperlink', () => {
  it('creates a normalized link over the mapped create range', () => {
    const editor = createHyperlinkEditor(paragraph('hello'), 1, 6)
    const hyperlink = useHyperlink(editor)

    expect(hyperlink.openCreate()).toBe(true)
    expect(get(hyperlink.state)).toMatchObject({mode: 'create', range: {from: 1, to: 6}})
    expect(hyperlink.apply({href: 'example.com'})).toMatchObject({
      applied: true,
      decision: {ok: true, href: 'https://example.com'},
    })
    expect(editor.state.doc.firstChild?.firstChild?.marks[0]?.attrs.href).toBe(
      'https://example.com',
    )
    expect(get(hyperlink.state)).toMatchObject({mode: 'closed'})
  })

  it('edits and unlinks the active link through public actions', () => {
    const editor = createHyperlinkEditor(linkedParagraph('hello', 'https://old.example.com'), 3)
    const hyperlink = useHyperlink(editor)

    expect(hyperlink.openEdit()).toBe(true)
    expect(hyperlink.apply({href: 'new.example.com', text: 'updated'}).applied).toBe(true)
    expect(editor.state.doc.textContent).toBe('updated')
    expect(editor.state.doc.firstChild?.firstChild?.marks[0]?.attrs.href).toBe(
      'https://new.example.com',
    )

    editor.updateState(
      editor.state.apply(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 3))),
    )
    expect(hyperlink.openEdit()).toBe(true)
    expect(hyperlink.unlink()).toBe(true)
    expect(editor.state.doc.firstChild?.firstChild?.marks).toHaveLength(0)
  })

  it('returns policy failures without mutating the document', () => {
    const editor = createHyperlinkEditor(paragraph('hello'), 1, 6)
    const hyperlink = useHyperlink(editor)
    hyperlink.openCreate()

    expect(hyperlink.apply({href: 'javascript:alert(1)'})).toMatchObject({
      applied: false,
      decision: {ok: false, reason: 'unsafe_scheme'},
    })
    expect(editor.state.doc.firstChild?.firstChild?.marks).toHaveLength(0)
  })

  it('canonicalizes a safe legacy link before copy and navigation', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {writeText},
    })
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const editor = createHyperlinkEditor(
      linkedParagraph('hello', 'example.com'),
      3,
      3,
      {allowLegacyHref: true},
    )
    const hyperlink = useHyperlink(editor)
    expect(hyperlink.openPreview()).toBe(true)
    expect(get(hyperlink.state).href).toBe('https://example.com')

    await expect(hyperlink.copy()).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('https://example.com')
    expect(hyperlink.navigate()).toBe(true)
    expect(open).toHaveBeenCalledWith(
      'https://example.com',
      '_blank',
      'noopener,noreferrer',
    )

    const unsafe = useHyperlink(
      createHyperlinkEditor(
        linkedParagraph('bad', 'javascript:alert(1)'),
        2,
        2,
        {allowLegacyHref: true},
      ),
    )
    expect(unsafe.openPreview()).toBe(false)
  })
})

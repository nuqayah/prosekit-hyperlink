import {createEditor, union, type Editor, type Extension, type NodeJSON} from 'prosekit/core'
import {pasteHTML, pasteText} from 'prosekit/core/test'
import {defineBold} from 'prosekit/extensions/bold'
import {defineCode} from 'prosekit/extensions/code'
import {defineCodeBlock} from 'prosekit/extensions/code-block'
import {defineDoc} from 'prosekit/extensions/doc'
import {defineParagraph} from 'prosekit/extensions/paragraph'
import {defineReadonly} from 'prosekit/extensions/readonly'
import {defineText} from 'prosekit/extensions/text'
import {Fragment, Slice} from 'prosekit/pm/model'
import {TextSelection} from 'prosekit/pm/state'
import {afterEach, describe, expect, it} from 'vitest'

import {defineHyperlink, getHyperlinkState, type HyperlinkOptions} from '../src/lib/index.js'

const mounted: Editor[] = []

afterEach(() => {
  for (const editor of mounted.splice(0)) editor.unmount()
  document.body.replaceChildren()
})

function createMountedEditor(
  content: NodeJSON,
  selection: {anchor: number; head?: number},
  options: HyperlinkOptions = {},
  extra: Extension[] = [],
) {
  const extension = union(
    defineDoc(),
    defineText(),
    defineParagraph(),
    defineBold(),
    defineCode(),
    ...extra,
    defineHyperlink(options),
  )
  const editor = createEditor({
    extension,
    defaultContent: content,
    defaultSelection: {
      type: 'text',
      anchor: selection.anchor,
      head: selection.head ?? selection.anchor,
    },
  })
  const element = document.createElement('div')
  document.body.append(element)
  editor.mount(element)
  mounted.push(editor)
  return editor
}

function typeText(editor: Editor, text: string) {
  const view = editor.view
  const {from, to} = view.state.selection
  const handled = view.someProp('handleTextInput', handler => handler(view, from, to, text, () => view.state.tr.insertText(text, from, to))) ?? false
  if (!handled) view.dispatch(view.state.tr.insertText(text, from, to))
}

function pressKey(editor: Editor, key: string) {
  const event = new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true})
  return editor.view.someProp('handleKeyDown', handler => handler(editor.view, event)) ?? false
}

function pressEnter(editor: Editor) {
  pressKey(editor, 'Enter')
}

function clickLink(
  editor: Editor,
  position = 3,
  init: MouseEventInit = {},
) {
  const anchor = editor.view.dom.querySelector('a[href]')
  if (!anchor) throw new Error('Expected a rendered link')

  const event = new MouseEvent('click', {button: 0, bubbles: true, cancelable: true, ...init})
  Object.defineProperty(event, 'target', {value: anchor})
  const handled = editor.view.someProp('handleClick', handler =>
    handler(editor.view, position, event),
  ) ?? false
  return {event, handled}
}

function paragraph(
  text: string,
  marks?: Array<{type: string; attrs?: Record<string, unknown>}>,
): NodeJSON {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: text ? [{type: 'text', text, ...(marks ? {marks} : {})}] : undefined,
      },
    ],
  }
}

function textNodes(editor: Editor) {
  return editor.getDocJSON().content?.[0]?.content ?? []
}

function replaceSliceText(slice: Slice, text: string): Slice {
  const schema = slice.content.firstChild?.type.schema
  return schema ? new Slice(Fragment.from(schema.text(text)), 0, 0) : slice
}

describe('hyperlink local interactions', () => {
  it('autolinks a bare domain when local typing adds a boundary', () => {
    const editor = createMountedEditor(paragraph('example.com'), {anchor: 12})

    typeText(editor, ' ')

    expect(textNodes(editor)).toEqual([
      expect.objectContaining({
        text: 'example.com',
        marks: [expect.objectContaining({type: 'link', attrs: expect.objectContaining({href: 'https://example.com'})})],
      }),
      {type: 'text', text: ' '},
    ])
  })

  it('autolinks a formatted international phone number', () => {
    const value = 'Call +1 (202) 555-0100'
    const editor = createMountedEditor(paragraph(value), {anchor: value.length + 1})

    typeText(editor, ' ')

    expect(textNodes(editor)[1]).toMatchObject({
      text: '+1 (202) 555-0100',
      marks: [{type: 'link', attrs: {href: 'tel:+12025550100'}}],
    })
  })

  it('only autolinks a trailing candidate', () => {
    const value = 'first.example ordinary'
    const editor = createMountedEditor(paragraph(value), {anchor: value.length + 1})

    typeText(editor, ' ')

    expect(textNodes(editor)).toEqual([{type: 'text', text: `${value} `}])
  })

  it('trims terminal punctuation while autolinking', () => {
    const editor = createMountedEditor(paragraph('example.com,'), {anchor: 13})

    typeText(editor, ' ')

    expect(textNodes(editor)).toEqual([
      expect.objectContaining({text: 'example.com', marks: [expect.objectContaining({type: 'link'})]}),
      {type: 'text', text: ', '},
    ])
  })

  it('autolinks before Enter without swallowing normal Enter handling', () => {
    const editor = createMountedEditor(paragraph('person@example.com'), {anchor: 19})

    pressEnter(editor)

    expect(textNodes(editor)[0]).toMatchObject({
      text: 'person@example.com',
      marks: [{type: 'link', attrs: {href: 'mailto:person@example.com'}}],
    })
  })

  it('does not autolink an arbitrary document transaction', () => {
    const editor = createMountedEditor(paragraph('example.com'), {anchor: 12})

    editor.view.dispatch(editor.view.state.tr.insertText(' ', 12))

    expect(textNodes(editor)).toEqual([{type: 'text', text: 'example.com '}])
  })

  it('updates a tracked automatic link when local text still forms a destination', () => {
    const editor = createMountedEditor(paragraph('example.com'), {anchor: 12})
    typeText(editor, ' ')
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 5)),
    )

    typeText(editor, 'x')

    expect(editor.state.doc.textContent).toBe('examxple.com ')
    expect(textNodes(editor)[0]).toMatchObject({
      text: 'examxple.com',
      marks: [{type: 'link', attrs: {href: 'https://examxple.com'}}],
    })
  })

  it('removes a tracked automatic link when local text stops being a destination', () => {
    const editor = createMountedEditor(paragraph('example.com'), {anchor: 12})
    typeText(editor, ' ')
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 5)),
    )

    typeText(editor, ' ')

    expect(editor.state.doc.textContent).toBe('exam ple.com ')
    expect(textNodes(editor).every(node => !node.marks?.some(mark => mark.type === 'link'))).toBe(true)
  })

  it('does not reconcile manual or reloaded links as automatic links', () => {
    const editor = createMountedEditor(
      paragraph('example.com', [
        {
          type: 'link',
          attrs: {href: 'https://example.com', target: null, rel: null},
        },
      ]),
      {anchor: 5},
    )

    typeText(editor, ' ')

    expect(editor.state.doc.textContent).toBe('exam ple.com')
    expect(textNodes(editor).some(node => node.marks?.some(mark => mark.type === 'link'))).toBe(true)
  })

  it.each([
    ['Backspace', 10],
    ['Delete', 8],
  ] as const)('%s removes a complete Unicode code point', (key, position) => {
    const value = 'issue:a😀b'
    const editor = createMountedEditor(
      paragraph(value),
      {anchor: value.length + 1},
      {policyOptions: {protocols: [{scheme: 'issue'}]}},
    )
    typeText(editor, ' ')
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, position)),
    )

    expect(pressKey(editor, key)).toBe(true)
    expect(editor.state.doc.textContent).toBe('issue:ab ')
    expect(textNodes(editor)[0]).toMatchObject({
      text: 'issue:ab',
      marks: [{type: 'link', attrs: {href: 'issue:ab'}}],
    })
  })

  it.each([
    ['Backspace', 9],
    ['Delete', 8],
  ] as const)('%s removes an invalidated tracked automatic link', (key, position) => {
    const editor = createMountedEditor(paragraph('example.com'), {anchor: 12})
    typeText(editor, ' ')
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, position)),
    )

    expect(pressKey(editor, key)).toBe(true)

    expect(editor.state.doc.textContent).toBe('examplecom ')
    expect(textNodes(editor).every(node => !node.marks?.some(mark => mark.type === 'link'))).toBe(true)
  })

  it('maps tracked automatic ranges through unrelated document changes', () => {
    const editor = createMountedEditor(paragraph('example.com'), {anchor: 12})
    typeText(editor, ' ')
    editor.view.dispatch(editor.state.tr.insertText('See ', 1))
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 9)),
    )

    typeText(editor, 'x')

    expect(editor.state.doc.textContent).toBe('See examxple.com ')
    expect(textNodes(editor)[1]).toMatchObject({
      text: 'examxple.com',
      marks: [{type: 'link', attrs: {href: 'https://examxple.com'}}],
    })
  })

  it('clears stored link marks at an edge only when exitable is enabled', () => {
    const attrs = {href: 'https://example.com', target: null, rel: null}
    const content = paragraph('example.com', [{type: 'link', attrs}])
    const enabled = createMountedEditor(content, {anchor: 12}, {exitable: true})
    const enabledMark = enabled.state.doc.firstChild?.firstChild?.marks[0]
    enabled.view.dispatch(enabled.state.tr.setStoredMarks(enabledMark ? [enabledMark] : []))

    expect(pressKey(enabled, 'ArrowRight')).toBe(false)
    expect(enabled.state.storedMarks).toEqual([])

    const disabled = createMountedEditor(content, {anchor: 12}, {exitable: false})
    const disabledMark = disabled.state.doc.firstChild?.firstChild?.marks[0]
    disabled.view.dispatch(disabled.state.tr.setStoredMarks(disabledMark ? [disabledMark] : []))

    expect(pressKey(disabled, 'ArrowRight')).toBe(false)
    expect(disabled.state.storedMarks?.[0]?.type.name).toBe('link')
  })

  it('does not autolink inside a code mark', () => {
    const editor = createMountedEditor(
      paragraph('example.com', [{type: 'code'}]),
      {anchor: 12},
    )

    typeText(editor, ' ')

    expect(textNodes(editor)).toEqual([
      {type: 'text', text: 'example.com', marks: [{type: 'code'}]},
      {type: 'text', text: ' '},
    ])
  })

  it('turns safe Markdown link syntax into a link', () => {
    const editor = createMountedEditor(paragraph('[Example](example.com'), {anchor: 22})

    typeText(editor, ')')

    expect(textNodes(editor)).toEqual([
      expect.objectContaining({
        text: 'Example',
        marks: [expect.objectContaining({type: 'link', attrs: expect.objectContaining({href: 'https://example.com'})})],
      }),
    ])
  })

  it('does not flatten mixed formatting in Markdown syntax', () => {
    const value = '[Example](example.com'
    const editor = createMountedEditor(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {type: 'text', text: '[Ex', marks: [{type: 'bold'}]},
              {type: 'text', text: 'ample](example.com'},
            ],
          },
        ],
      },
      {anchor: value.length + 1},
    )

    typeText(editor, ')')

    expect(editor.state.doc.textContent).toBe(`${value})`)
    expect(textNodes(editor)[0]?.marks).toEqual([{type: 'bold'}])
    expect(textNodes(editor)[1]?.marks).toBeUndefined()
  })

  it('leaves unsafe Markdown link syntax literal', () => {
    const value = '[Bad](javascript:alert'
    const editor = createMountedEditor(paragraph(value), {anchor: value.length + 1})

    typeText(editor, ')')

    expect(editor.state.doc.textContent).toBe(`${value})`)
    expect(textNodes(editor)[0]?.marks).toBeUndefined()
  })

  it('does not treat Markdown image syntax as a link shortcut', () => {
    const value = '![Alt](example.com'
    const editor = createMountedEditor(paragraph(value), {anchor: value.length + 1})

    typeText(editor, ')')

    expect(editor.state.doc.textContent).toBe(`${value})`)
  })

  it('links selected formatted text when one destination is pasted', () => {
    const editor = createMountedEditor(
      paragraph('hello', [{type: 'bold'}]),
      {anchor: 1, head: 6},
    )

    pasteText(editor.view, 'example.com')

    expect(textNodes(editor)[0]).toMatchObject({
      text: 'hello',
      marks: expect.arrayContaining([
        {type: 'bold'},
        expect.objectContaining({type: 'link', attrs: expect.objectContaining({href: 'https://example.com'})}),
      ]),
    })
  })

  it('does not link selected code-marked text when a destination is pasted', () => {
    const editor = createMountedEditor(
      paragraph('example', [{type: 'code'}]),
      {anchor: 1, head: 8},
    )

    pasteText(editor.view, 'example.com')

    expect(textNodes(editor)).toEqual([
      {type: 'text', text: 'example.com', marks: [{type: 'code'}]},
    ])
  })

  it('linkifies ordinary plain-text paste', () => {
    const editor = createMountedEditor(paragraph(''), {anchor: 1})

    pasteText(editor.view, 'Visit example.com or person@example.com.')

    expect(textNodes(editor)).toEqual([
      {type: 'text', text: 'Visit '},
      expect.objectContaining({text: 'example.com', marks: [expect.objectContaining({type: 'link'})]}),
      {type: 'text', text: ' or '},
      expect.objectContaining({text: 'person@example.com', marks: [expect.objectContaining({type: 'link'})]}),
      {type: 'text', text: '.'},
    ])
  })

  it('preserves rich pasted marks while adding links', () => {
    const editor = createMountedEditor(paragraph(''), {anchor: 1})

    pasteHTML(editor.view, '<p>Visit <strong>example.com</strong></p>')

    expect(textNodes(editor)[1]).toMatchObject({
      text: 'example.com',
      marks: expect.arrayContaining([
        {type: 'bold'},
        expect.objectContaining({type: 'link'}),
      ]),
    })
  })

  it('runs a pure host paste transform before linkification', () => {
    let calls = 0
    const editor = createMountedEditor(
      paragraph(''),
      {anchor: 1},
      {
        transformPastedSlice(slice) {
          calls++
          return replaceSliceText(slice, 'example.com')
        },
      },
    )

    pasteHTML(editor.view, '<p><strong>ignored.example</strong></p>')

    expect(calls).toBe(1)
    expect(textNodes(editor)).toEqual([
      expect.objectContaining({
        text: 'example.com',
        marks: [expect.objectContaining({type: 'link'})],
      }),
    ])
  })

  it('applies a host paste transform without requiring a detected link', () => {
    const editor = createMountedEditor(
      paragraph(''),
      {anchor: 1},
      {transformPastedSlice: slice => replaceSliceText(slice, 'sanitized')},
    )

    pasteText(editor.view, 'original')

    expect(editor.state.doc.textContent).toBe('sanitized')
  })

  it('does not relink internal ProseMirror clipboard content', () => {
    let transforms = 0
    const editor = createMountedEditor(
      paragraph('example.com '),
      {anchor: 1, head: 12},
      {transformPastedSlice: slice => (transforms++, slice)},
    )
    const copied = editor.view.serializeForClipboard(editor.state.selection.content())
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 13)),
    )

    const clipboard = new DataTransfer()
    clipboard.setData('text/plain', copied.text)
    clipboard.setData('text/html', copied.dom.innerHTML)
    editor.view.pasteHTML(
      copied.dom.innerHTML,
      new ClipboardEvent('paste', {clipboardData: clipboard}),
    )

    expect(transforms).toBe(0)
    expect(editor.state.doc.textContent).toBe('example.com example.com')
    expect(textNodes(editor).every(node => !node.marks?.length)).toBe(true)
  })

  it('does not own paste in a code block context', () => {
    let transforms = 0
    const editor = createMountedEditor(
      {type: 'doc', content: [{type: 'codeBlock'}]},
      {anchor: 1},
      {transformPastedSlice: slice => (transforms++, slice)},
      [defineCodeBlock()],
    )

    pasteText(editor.view, 'example.com')

    expect(transforms).toBe(0)
    expect(editor.getDocJSON().content?.[0]).toMatchObject({
      type: 'codeBlock',
      content: [{type: 'text', text: 'example.com'}],
    })
  })

  it('does not linkify pasted code blocks', () => {
    const editor = createMountedEditor(paragraph(''), {anchor: 1}, {}, [defineCodeBlock()])

    pasteHTML(editor.view, '<pre><code>example.com</code></pre>')

    expect(editor.getDocJSON().content?.[0]).toMatchObject({
      type: 'codeBlock',
      content: [{type: 'text', text: 'example.com'}],
    })
  })

  it('opens preview state on an ordinary editable link click', () => {
    const editor = createMountedEditor(
      paragraph('hello', [
        {
          type: 'link',
          attrs: {href: 'https://example.com', target: null, rel: null},
        },
      ]),
      {anchor: 3},
    )

    const {event, handled} = clickLink(editor)

    expect(handled).toBe(true)
    expect(event.defaultPrevented).toBe(true)
    expect(getHyperlinkState(editor.state)).toMatchObject({
      mode: 'preview',
      range: {from: 1, to: 6},
      attrs: {href: 'https://example.com'},
      text: 'hello',
      trigger: 'click',
    })
    expect(editor.state.selection.from).toBe(3)
    expect(editor.state.selection.to).toBe(3)
  })

  it('canonicalizes a legacy href before opening click preview', () => {
    const editor = createMountedEditor(
      paragraph('hello', [{type: 'link', attrs: {href: 'example.com'}}]),
      {anchor: 3},
      {allowLegacyHref: true},
    )

    expect(clickLink(editor).handled).toBe(true)
    expect(getHyperlinkState(editor.state)).toMatchObject({
      mode: 'preview',
      attrs: {href: 'https://example.com'},
    })
  })

  it('can select the complete link when opening click preview', () => {
    const editor = createMountedEditor(
      paragraph('hello', [
        {
          type: 'link',
          attrs: {href: 'https://example.com', target: null, rel: null},
        },
      ]),
      {anchor: 3},
      {selectOnClick: true},
    )

    expect(clickLink(editor).handled).toBe(true)
    expect(editor.state.selection.from).toBe(1)
    expect(editor.state.selection.to).toBe(6)
  })

  it('leaves modified and read-only link clicks to native behavior', () => {
    const content = paragraph('hello', [
      {
        type: 'link',
        attrs: {href: 'https://example.com', target: null, rel: null},
      },
    ])
    const editable = createMountedEditor(content, {anchor: 3})
    const modified = clickLink(editable, 3, {metaKey: true})
    expect(modified.handled).toBe(false)
    expect(modified.event.defaultPrevented).toBe(false)
    expect(getHyperlinkState(editable.state)).toEqual({mode: 'closed'})

    const readonly = createMountedEditor(content, {anchor: 3}, {}, [defineReadonly()])
    const native = clickLink(readonly)
    expect(native.handled).toBe(false)
    expect(native.event.defaultPrevented).toBe(false)
    expect(getHyperlinkState(readonly.state)).toEqual({mode: 'closed'})
  })

  it('honors behavior opt-outs', () => {
    const editor = createMountedEditor(
      paragraph('example.com'),
      {anchor: 12},
      {autolink: false, markdownShortcut: false, linkOnPaste: false},
    )

    typeText(editor, ' ')
    expect(textNodes(editor)[0]?.marks).toBeUndefined()

    editor.updateState(
      editor.state.apply(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 12)),
      ),
    )
    pasteText(editor.view, 'example.org')
    expect(editor.state.doc.textContent).toContain('example.org')
  })
})

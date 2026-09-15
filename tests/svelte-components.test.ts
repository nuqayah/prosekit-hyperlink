import {createEditor, union, type NodeJSON} from 'prosekit/core'
import {defineDoc} from 'prosekit/extensions/doc'
import {defineParagraph} from 'prosekit/extensions/paragraph'
import {defineText} from 'prosekit/extensions/text'
import {mount, tick, unmount} from 'svelte'
import {afterEach, describe, expect, it} from 'vitest'

import {defineHyperlink, getHyperlinkState} from '../src/lib/index.js'
import {
  HyperlinkButton,
  HyperlinkPopover,
} from '../src/lib/svelte/index.js'

const extension = union(defineDoc(), defineParagraph(), defineText(), defineHyperlink())

function createHyperlinkEditor(content: NodeJSON, anchor = 1, head = anchor) {
  return createEditor({
    extension,
    defaultContent: content,
    defaultSelection: {type: 'text', anchor, head},
  })
}

function paragraph(text: string): NodeJSON {
  return {
    type: 'doc',
    content: [{type: 'paragraph', content: text ? [{type: 'text', text}] : undefined}],
  }
}

function linkedParagraph(text: string, href: string): NodeJSON {
  return {
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
  }
}

function inputValue(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', {bubbles: true}))
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('Svelte hyperlink components', () => {
  it('opens create or edit state from the toolbar button', async () => {
    const target = document.body.appendChild(document.createElement('div'))
    const createEditor = createHyperlinkEditor(paragraph('hello'), 1, 6)
    const createButton = mount(HyperlinkButton, {target, props: {editor: createEditor}})
    const button = target.querySelector('button')

    expect(button?.getAttribute('aria-label')).toBe('Add link')
    button?.dispatchEvent(new MouseEvent('click', {bubbles: true}))
    await tick()
    expect(getHyperlinkState(createEditor.state)).toMatchObject({
      mode: 'create',
      range: {from: 1, to: 6},
      trigger: 'toolbar',
    })
    await unmount(createButton)

    target.replaceChildren()
    const editEditor = createHyperlinkEditor(
      linkedParagraph('hello', 'https://example.com'),
      3,
    )
    const editButton = mount(HyperlinkButton, {target, props: {editor: editEditor}})
    const activeButton = target.querySelector('button')
    expect(activeButton?.getAttribute('aria-label')).toBe('Edit link')
    expect(activeButton?.getAttribute('aria-pressed')).toBe('true')
    activeButton?.dispatchEvent(new MouseEvent('click', {bubbles: true}))
    await tick()
    expect(getHyperlinkState(editEditor.state)).toMatchObject({mode: 'edit'})
    await unmount(editButton)
  })

  it('shows inline validation and applies a valid destination', async () => {
    const target = document.body.appendChild(document.createElement('div'))
    const editor = createHyperlinkEditor(paragraph('hello'), 1, 6)
    editor.mount(document.body.appendChild(document.createElement('div')))
    const component = mount(HyperlinkPopover, {
      target,
      props: {editor, portalTarget: false, showArrow: false},
    })

    expect(editor.commands.openLinkPopover({mode: 'create'})).toBe(true)
    await tick()

    const form = target.querySelector('form')
    const url = target.querySelector('input[inputmode="url"]') as HTMLInputElement
    expect(form).not.toBeNull()
    expect(url).not.toBeNull()

    inputValue(url, 'javascript:alert(1)')
    form?.dispatchEvent(new SubmitEvent('submit', {bubbles: true, cancelable: true}))
    await tick()
    expect(target.querySelector('[role="alert"]')?.textContent).toContain('not safe')
    expect(getHyperlinkState(editor.state)).toMatchObject({mode: 'create'})

    inputValue(url, 'example.com')
    form?.dispatchEvent(new SubmitEvent('submit', {bubbles: true, cancelable: true}))
    await tick()
    expect(editor.state.doc.firstChild?.firstChild?.marks[0]?.attrs.href).toBe(
      'https://example.com',
    )
    expect(getHyperlinkState(editor.state)).toEqual({mode: 'closed'})
    expect(target.querySelector('.pkh-popover')).toBeNull()

    await unmount(component)
    editor.unmount()
  })

  it('renders localized labels and RTL direction', async () => {
    const target = document.body.appendChild(document.createElement('div'))
    const editor = createHyperlinkEditor(paragraph('hello'), 1, 6)
    editor.mount(document.body.appendChild(document.createElement('div')))
    const component = mount(HyperlinkPopover, {
      target,
      props: {
        editor,
        portalTarget: false,
        dir: 'rtl',
        messages: {addLink: 'إضافة رابط', apply: 'تطبيق'},
      },
    })

    editor.commands.openLinkPopover({mode: 'create'})
    await tick()
    const dialog = target.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-label')).toBe('إضافة رابط')
    expect(dialog?.getAttribute('dir')).toBe('rtl')
    expect(target.querySelector('button[type="submit"]')?.textContent).toContain('تطبيق')
    await unmount(component)
    editor.unmount()
  })
})

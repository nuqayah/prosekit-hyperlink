import {createEditor, union, type NodeJSON} from 'prosekit/core'
import {defineCodeBlock} from 'prosekit/extensions/code-block'
import {defineDoc} from 'prosekit/extensions/doc'
import {defineParagraph} from 'prosekit/extensions/paragraph'
import {defineText} from 'prosekit/extensions/text'
import {describe, expect, it} from 'vitest'

import {
  createHyperlinkPolicy,
  defineHyperlink,
  getHyperlinkPolicy,
  getHyperlinkState,
  type HyperlinkUIState,
} from '../src/lib/index.js'

const extension = union(defineDoc(), defineParagraph(), defineText(), defineHyperlink())

function editorWith(content: NodeJSON, anchor = 1, head = anchor) {
  return createEditor({
    extension,
    defaultContent: content,
    defaultSelection: {type: 'text', anchor, head},
  })
}

function link(href: string) {
  return {type: 'link', attrs: {href, target: null, rel: null}}
}

function openState(editor: ReturnType<typeof editorWith>) {
  return getHyperlinkState(editor.state) as Exclude<HyperlinkUIState, {mode: 'closed'}>
}

describe('hyperlink UI state', () => {
  it('exposes the configured policy through editor state', () => {
    const policy = createHyperlinkPolicy({defaultProtocol: 'http'})
    const editor = createEditor({
      extension: union(defineDoc(), defineParagraph(), defineText(), defineHyperlink({policy})),
      defaultContent: {type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text: 'hello'}]}]},
    })

    expect(getHyperlinkPolicy(editor.state)).toBe(policy)
    expect(getHyperlinkPolicy(editor.state)?.normalize('example.com')).toMatchObject({
      ok: true,
      href: 'http://example.com',
    })
  })

  it('opens create state over the current selection and closes it', () => {
    const editor = editorWith(
      {type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text: 'hello'}]}]},
      1,
      6,
    )

    expect(getHyperlinkState(editor.state)).toEqual({mode: 'closed'})
    expect(editor.commands.openLinkPopover()).toBe(true)
    expect(openState(editor)).toEqual({
      mode: 'create',
      range: {from: 1, to: 6},
      attrs: {},
      text: 'hello',
      trigger: 'programmatic',
    })
    expect(editor.commands.closeLinkPopover()).toBe(true)
    expect(getHyperlinkState(editor.state)).toEqual({mode: 'closed'})
    expect(editor.commands.closeLinkPopover()).toBe(false)
  })

  it('defaults to edit mode inside a link and exposes complete attrs', () => {
    const editor = editorWith(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{type: 'text', text: 'hello', marks: [link('https://example.com')]}],
          },
        ],
      },
      3,
    )

    expect(editor.commands.openLinkPopover({trigger: 'keyboard'})).toBe(true)
    expect(openState(editor)).toMatchObject({
      mode: 'edit',
      range: {from: 1, to: 6},
      text: 'hello',
      trigger: 'keyboard',
      attrs: {href: 'https://example.com'},
    })
  })

  it('does not open create mode where the schema disallows links', () => {
    const editor = createEditor({
      extension: union(
        defineDoc(),
        defineText(),
        defineCodeBlock(),
        defineHyperlink(),
      ),
      defaultContent: {
        type: 'doc',
        content: [{type: 'codeBlock', content: [{type: 'text', text: 'example.com'}]}],
      },
      defaultSelection: {type: 'text', anchor: 3, head: 3},
    })

    expect(editor.commands.openLinkPopover({mode: 'create'})).toBe(false)
    expect(getHyperlinkState(editor.state)).toEqual({mode: 'closed'})
  })

  it('rejects a mixed selection that includes a mark-disallowed block', () => {
    const editor = createEditor({
      extension: union(
        defineDoc(),
        defineParagraph(),
        defineCodeBlock(),
        defineText(),
        defineHyperlink(),
      ),
      defaultContent: {
        type: 'doc',
        content: [
          {type: 'paragraph', content: [{type: 'text', text: 'one'}]},
          {type: 'codeBlock', content: [{type: 'text', text: 'two'}]},
        ],
      },
      defaultSelection: {type: 'text', anchor: 1, head: 8},
    })
    const before = editor.getDocJSON()

    expect(editor.commands.openLinkPopover({mode: 'create'})).toBe(false)
    expect(editor.commands.addLink({href: 'example.com'})).toBe(false)
    expect(editor.getDocJSON()).toEqual(before)
  })

  it('requires an active link for preview/edit modes', () => {
    const editor = editorWith({type: 'doc', content: [{type: 'paragraph'}]})
    expect(editor.commands.openLinkPopover({mode: 'preview'})).toBe(false)
    expect(editor.commands.openLinkPopover({mode: 'edit'})).toBe(false)
    expect(getHyperlinkState(editor.state)).toEqual({mode: 'closed'})
  })

  it('maps create ranges through document changes', () => {
    const editor = editorWith(
      {type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text: 'hello'}]}]},
      2,
      5,
    )
    editor.commands.openLinkPopover({attrs: {href: 'example.com'}})

    editor.exec((state, dispatch) => {
      dispatch?.(state.tr.insertText('x', 1))
      return true
    })

    expect(openState(editor)).toMatchObject({
      mode: 'create',
      range: {from: 3, to: 6},
      text: 'ell',
      attrs: {href: 'example.com'},
    })
  })

  it('refreshes edit state after a link update', () => {
    const editor = editorWith(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{type: 'text', text: 'hello', marks: [link('https://old.example.com')]}],
          },
        ],
      },
      3,
    )
    editor.commands.openLinkPopover()

    expect(editor.commands.updateLink({href: 'new.example.com'})).toBe(true)
    expect(openState(editor)).toMatchObject({
      mode: 'edit',
      range: {from: 1, to: 6},
      attrs: {href: 'https://new.example.com'},
      text: 'hello',
    })
  })

  it('closes edit state when the link is removed', () => {
    const editor = editorWith(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{type: 'text', text: 'hello', marks: [link('https://example.com')]}],
          },
        ],
      },
      3,
    )
    editor.commands.openLinkPopover()

    expect(editor.commands.removeLink()).toBe(true)
    expect(getHyperlinkState(editor.state)).toEqual({mode: 'closed'})
  })
})

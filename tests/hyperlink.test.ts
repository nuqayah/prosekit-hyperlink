import {Window} from 'happy-dom'
import {
  createEditor,
  defineMarkAttr,
  htmlFromNode,
  nodeFromHTML,
  union,
  type NodeJSON,
} from 'prosekit/core'
import {defineBold} from 'prosekit/extensions/bold'
import {defineDoc} from 'prosekit/extensions/doc'
import {defineParagraph} from 'prosekit/extensions/paragraph'
import {defineText} from 'prosekit/extensions/text'
import {describe, expect, it} from 'vitest'

import {defineHyperlink, getActiveLink} from '../src/lib/hyperlink.js'
import {createHyperlinkPolicy} from '../src/lib/policy.js'

const extension = union(
  defineDoc(),
  defineParagraph(),
  defineText(),
  defineBold(),
  defineHyperlink({HTMLAttributes: {class: 'pkh-link'}}),
  defineMarkAttr({
    type: 'link',
    attr: 'trackingId',
    default: null,
    validate: 'string|null',
  }),
)

const emptyDoc = {type: 'doc', content: [{type: 'paragraph'}]}

function editorWith(content: NodeJSON, anchor = 1, head = anchor) {
  return createEditor({
    extension,
    defaultContent: content,
    defaultSelection: {type: 'text', anchor, head},
  })
}

function link(href: string, trackingId: string | null = null) {
  return {
    type: 'link',
    attrs: {href, target: null, rel: null, trackingId},
  }
}

function firstText(editor: ReturnType<typeof editorWith>) {
  return editor.getDocJSON().content?.[0]?.content?.[0]
}

describe('ProseKit hyperlink mark and commands', () => {
  it('composes consumer attrs without losing hyperlink defaults', () => {
    const policy = createHyperlinkPolicy({defaultProtocol: 'http'})
    const options = {
      policy,
      defaultAttributes: {target: '_blank', trackingId: 'campaign-1'},
    }
    const editor = createEditor({
      extension: union(
        defineDoc(),
        defineParagraph(),
        defineText(),
        defineHyperlink(options),
        defineMarkAttr({
          type: 'link',
          attr: 'trackingId',
          default: null,
          validate: 'string|null',
        }),
      ),
      defaultContent: {
        type: 'doc',
        content: [{type: 'paragraph', content: [{type: 'text', text: 'hello'}]}],
      },
      defaultSelection: {type: 'text', anchor: 1, head: 6},
    })

    expect(editor.commands.addLink({href: 'example.com'})).toBe(true)
    expect(editor.getDocJSON().content?.[0]?.content?.[0]?.marks?.[0]).toMatchObject({
      type: 'link',
      attrs: {
        href: 'http://example.com',
        target: '_blank',
        rel: null,
        trackingId: 'campaign-1',
      },
    })
  })

  it('rejects ambiguous policy configuration', () => {
    expect(() =>
      defineHyperlink({
        policy: createHyperlinkPolicy(),
        policyOptions: {defaultProtocol: 'http'},
      })
    ).toThrow('Pass policy or policyOptions, not both')
  })

  it('adds a normalized link over selected formatted text', () => {
    const editor = editorWith(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{type: 'text', text: 'hello', marks: [{type: 'bold'}]}],
          },
        ],
      },
      1,
      6,
    )

    expect(editor.commands.addLink({href: 'example.com'})).toBe(true)
    expect(firstText(editor)).toMatchObject({type: 'text', text: 'hello'})
    expect(firstText(editor)?.marks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({type: 'bold'}),
        expect.objectContaining({
          type: 'link',
          attrs: expect.objectContaining({href: 'https://example.com'}),
        }),
      ]),
    )
  })

  it('inserts linked display text at a collapsed cursor', () => {
    const editor = editorWith(emptyDoc)

    expect(editor.commands.addLink({href: 'example.com'}, 'Example')).toBe(true)
    expect(firstText(editor)).toMatchObject({
      text: 'Example',
      marks: [{type: 'link', attrs: {href: 'https://example.com'}}],
    })
    expect(editor.state.selection.from).toBe(8)
  })

  it('rejects invalid input without mutating the document', () => {
    const editor = editorWith(emptyDoc)
    const before = editor.getDocJSON()

    expect(editor.commands.addLink({href: 'javascript:alert(1)'}, 'bad')).toBe(false)
    expect(editor.getDocJSON()).toEqual(before)
  })

  it('rejects invalid custom attributes at command boundaries', () => {
    const editor = editorWith(
      {
        type: 'doc',
        content: [{type: 'paragraph', content: [{type: 'text', text: 'hello'}]}],
      },
      1,
      6,
    )
    const before = editor.getDocJSON()

    expect(editor.commands.addLink({href: 'example.com', trackingId: 42})).toBe(false)
    expect(editor.getDocJSON()).toEqual(before)
  })

  it('removes only the link mark from a collapsed selection', () => {
    const editor = editorWith(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'hello',
                marks: [{type: 'bold'}, link('https://example.com')],
              },
            ],
          },
        ],
      },
      3,
    )

    expect(editor.commands.removeLink()).toBe(true)
    expect(firstText(editor)?.marks).toEqual([{type: 'bold'}])
  })

  it('updates href while preserving custom mark attributes', () => {
    const editor = editorWith(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'hello',
                marks: [link('https://old.example', 'campaign-1')],
              },
            ],
          },
        ],
      },
      3,
    )

    expect(editor.commands.updateLink({href: 'new.example.com'})).toBe(true)
    expect(firstText(editor)?.marks?.[0]).toMatchObject({
      type: 'link',
      attrs: {href: 'https://new.example.com', trackingId: 'campaign-1'},
    })
  })

  it('updates a selected link that starts after plain text', () => {
    const editor = editorWith(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {type: 'text', text: 'before '},
              {type: 'text', text: 'Example', marks: [link('https://old.example.com')]},
              {type: 'text', text: ' after'},
            ],
          },
        ],
      },
      8,
      15,
    )

    expect(getActiveLink(editor.state)).toMatchObject({from: 8, to: 15})
    expect(editor.commands.updateLink({href: 'new.example.com'})).toBe(true)
    expect(editor.getDocJSON().content?.[0]?.content?.[1]?.marks?.[0]).toMatchObject({
      type: 'link',
      attrs: {href: 'https://new.example.com'},
    })
  })

  it('does not claim internal boundaries or selections extending past a link', () => {
    const content = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {type: 'text', text: 'before '},
            {type: 'text', text: 'Example', marks: [link('https://example.com')]},
            {type: 'text', text: ' after'},
          ],
        },
      ],
    }

    expect(getActiveLink(editorWith(content, 8).state)).toBeNull()
    expect(getActiveLink(editorWith(content, 15).state)).toBeNull()
    expect(getActiveLink(editorWith(content, 8, 17).state)).toBeNull()
    const startsInside = editorWith(content, 10, 17)
    expect(getActiveLink(startsInside.state)).toBeNull()
    expect(getActiveLink(startsInside.state, 10)).toMatchObject({from: 8, to: 15})
  })

  it('rejects invalid custom attributes during updates', () => {
    const editor = editorWith(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'hello',
                marks: [link('https://old.example.com', 'campaign-1')],
              },
            ],
          },
        ],
      },
      3,
    )
    const before = editor.getDocJSON()

    expect(editor.commands.updateLink({attrs: {trackingId: 42}})).toBe(false)
    expect(editor.getDocJSON()).toEqual(before)
  })

  it('updates simple link text without losing unrelated marks', () => {
    const editor = editorWith(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'hello',
                marks: [{type: 'bold'}, link('https://example.com')],
              },
            ],
          },
        ],
      },
      3,
    )

    expect(editor.commands.updateLink({text: 'updated'})).toBe(true)
    expect(firstText(editor)).toMatchObject({text: 'updated'})
    expect(firstText(editor)?.marks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({type: 'bold'}),
        expect.objectContaining({
          type: 'link',
          attrs: expect.objectContaining({href: 'https://example.com'}),
        }),
      ]),
    )
  })

  it('refuses to flatten mixed formatting during text replacement', () => {
    const editor = editorWith(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {type: 'text', text: 'one', marks: [link('https://example.com')]},
              {
                type: 'text',
                text: 'two',
                marks: [{type: 'bold'}, link('https://example.com')],
              },
            ],
          },
        ],
      },
      2,
    )
    const before = editor.getDocJSON()

    expect(editor.commands.updateLink({text: 'all'})).toBe(false)
    expect(editor.getDocJSON()).toEqual(before)
  })

  it('keeps adjacent links with different attributes as separate ranges', () => {
    const editor = editorWith({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {type: 'text', text: 'aa', marks: [link('https://one.example')]},
            {type: 'text', text: 'bb', marks: [link('https://two.example')]},
          ],
        },
      ],
    })

    expect(getActiveLink(editor.state, 2)).toMatchObject({
      from: 1,
      to: 3,
      mark: {attrs: {href: 'https://one.example'}},
    })
    expect(getActiveLink(editor.state, 3)).toBeNull()
    expect(getActiveLink(editor.state, 4)).toMatchObject({
      from: 3,
      to: 5,
      mark: {attrs: {href: 'https://two.example'}},
    })
  })

  it('keeps canExec and execution validation aligned', () => {
    const editor = editorWith(
      {
        type: 'doc',
        content: [{type: 'paragraph', content: [{type: 'text', text: 'hello'}]}],
      },
      1,
      6,
    )

    expect(editor.commands.addLink.canExec({href: 'javascript:alert(1)'})).toBe(false)
    expect(editor.commands.addLink.canExec({href: 'example.com'})).toBe(true)
    expect(editor.commands.addLink({href: 'example.com'})).toBe(true)
  })

  it('admits legacy PM JSON only when opted in and still renders it safely', () => {
    const makeDoc = (href: string) => ({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{type: 'text', text: 'x', marks: [{type: 'link', attrs: {href}}]}],
        },
      ],
    })
    const strict = editorWith(emptyDoc)

    expect(() => strict.schema.nodeFromJSON(makeDoc('javascript:alert(1)'))).toThrow(
      'Invalid hyperlink href',
    )
    expect(() => strict.schema.nodeFromJSON(makeDoc('example.com'))).toThrow(
      'Invalid hyperlink href',
    )

    const legacy = createEditor({
      extension: union(
        defineDoc(),
        defineParagraph(),
        defineText(),
        defineHyperlink({allowLegacyHref: true}),
      ),
    })
    const safe = legacy.schema.nodeFromJSON(makeDoc('example.com'))
    const unsafe = legacy.schema.nodeFromJSON(makeDoc('javascript:alert(1)'))
    const document = new Window().document as unknown as Document

    expect(safe.firstChild?.firstChild?.marks[0]?.attrs.href).toBe('example.com')
    expect(htmlFromNode(safe, {document})).toContain('href="https://example.com"')
    expect(htmlFromNode(unsafe, {document})).toContain('data-hyperlink-invalid')
    expect(htmlFromNode(unsafe, {document})).not.toContain('<a')
  })

  it('normalizes safe DOM anchors and drops unsafe marks while preserving text', () => {
    const editor = editorWith(emptyDoc)
    const window = new Window()
    const doc = nodeFromHTML(
      '<p><a href="example.com" title="Site">safe</a> <a href="javascript:alert(1)">bad</a></p>',
      {schema: editor.schema, document: window.document as unknown as Document},
    )
    const json = doc.toJSON()

    expect(json.content[0].content[0]).toMatchObject({
      text: 'safe',
      marks: [{type: 'link', attrs: {href: 'https://example.com'}}],
    })
    expect(json.content[0].content[1]).toMatchObject({text: ' bad'})
    expect(json.content[0].content[1].marks).toBeUndefined()
  })

  it('hardens case-insensitive blank targets and emits package styling attributes', () => {
    const editor = editorWith({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'site',
              marks: [
                {
                  type: 'link',
                  attrs: {
                    href: 'https://example.com',
                    target: '_BLANK',
                    rel: 'UGC OPENER NoOpener',
                    trackingId: null,
                  },
                },
              ],
            },
          ],
        },
      ],
    })
    const window = new Window()
    const html = htmlFromNode(editor.state.doc, {document: window.document as unknown as Document})
    const container = window.document.createElement('div')
    container.innerHTML = html
    const anchor = container.querySelector('a')

    expect(anchor?.getAttribute('href')).toBe('https://example.com')
    expect(anchor?.getAttribute('target')).toBe('_BLANK')
    expect(anchor?.getAttribute('rel')).toBe('ugc noopener noreferrer')
    expect(anchor?.getAttribute('class')).toBe('pkh-link')
  })
})

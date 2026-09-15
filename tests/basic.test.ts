import {createEditor} from 'prosekit/core'
import {defineBasicExtension} from 'prosekit/basic'
import {describe, expect, it} from 'vitest'

import {defineBasicExtensionWithHyperlink} from '../src/lib/basic.js'

function schemaSurface(editor: ReturnType<typeof createEditor>) {
  return {
    nodes: Object.keys(editor.schema.nodes),
    marks: Object.keys(editor.schema.marks),
  }
}

describe('defineBasicExtensionWithHyperlink', () => {
  it('preserves the native link storage shape and defaults', () => {
    const native = createEditor({extension: defineBasicExtension()}).schema.marks.link
    const replacement = createEditor({
      extension: defineBasicExtensionWithHyperlink(),
    }).schema.marks.link

    expect(Object.keys(replacement.spec.attrs ?? {})).toEqual(
      Object.keys(native.spec.attrs ?? {}),
    )
    for (const name of Object.keys(native.spec.attrs ?? {})) {
      expect(replacement.spec.attrs?.[name]?.default).toEqual(
        native.spec.attrs?.[name]?.default,
      )
    }
    expect(replacement.spec.inclusive).toBe(native.spec.inclusive)
  })

  it('preserves the basic node and mark names and ordering', () => {
    const native = createEditor({extension: defineBasicExtension()})
    const hyperlink = createEditor({extension: defineBasicExtensionWithHyperlink()})

    expect(schemaSurface(hyperlink)).toEqual(schemaSurface(native))
  })

  it('exposes the richer hyperlink commands without native duplicate rules', () => {
    const editor = createEditor({
      extension: defineBasicExtensionWithHyperlink(),
      defaultContent: {
        type: 'doc',
        content: [
          {type: 'paragraph', content: [{type: 'text', text: 'example.com'}]},
        ],
      },
      defaultSelection: {type: 'text', anchor: 1, head: 12},
    })

    expect(editor.commands.updateLink).toBeTypeOf('function')
    expect(editor.commands.addLink({href: 'example.com'})).toBe(true)
    expect(editor.getDocJSON().content?.[0]?.content?.[0]?.marks?.[0]).toMatchObject({
      type: 'link',
      attrs: {href: 'https://example.com'},
    })
    expect(editor.schema.marks.link.spec.parseDOM).toHaveLength(1)
  })

  it('threads hyperlink policy options through the convenience extension', () => {
    const editor = createEditor({
      extension: defineBasicExtensionWithHyperlink({
        policyOptions: {defaultProtocol: 'http'},
      }),
      defaultContent: {
        type: 'doc',
        content: [{type: 'paragraph', content: [{type: 'text', text: 'site'}]}],
      },
      defaultSelection: {type: 'text', anchor: 1, head: 5},
    })

    expect(editor.commands.addLink({href: 'example.com'})).toBe(true)
    expect(editor.getDocJSON().content?.[0]?.content?.[0]?.marks?.[0]?.attrs?.href).toBe(
      'http://example.com',
    )
  })
})

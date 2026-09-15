import {
  MarkdownParser,
  MarkdownSerializer,
  defaultMarkdownParser,
  defaultMarkdownSerializer,
} from 'prosemirror-markdown'
import {createEditor, defineMarkAttr, union} from 'prosekit/core'
import {describe, expect, it} from 'vitest'

import {defineBasicExtensionWithHyperlink} from '../src/lib/basic.js'
import {
  createHyperlinkMarkdownParser,
  createHyperlinkMarkdownSerializer,
} from '../src/lib/markdown.js'
import {createHyperlinkPolicy} from '../src/lib/policy.js'

function schema() {
  return createEditor({
    extension: union(
      defineBasicExtensionWithHyperlink(),
      defineMarkAttr({
        type: 'link',
        attr: 'title',
        default: null,
        validate: 'string|null',
      }),
    ),
  }).schema
}

function parser() {
  const base = new MarkdownParser(schema(), defaultMarkdownParser.tokenizer, {
    paragraph: {block: 'paragraph'},
    link: {mark: 'link'},
  })
  return createHyperlinkMarkdownParser(base)
}

function serializer() {
  const base = new MarkdownSerializer(
    {
      paragraph: defaultMarkdownSerializer.nodes.paragraph,
      text: defaultMarkdownSerializer.nodes.text,
    },
    {link: defaultMarkdownSerializer.marks.link},
  )
  return createHyperlinkMarkdownSerializer(base)
}

describe('Markdown parser adapter', () => {
  it('normalizes safe imported destinations and preserves titles', () => {
    expect(parser().parse('[Docs](example.com "Reference")').toJSON()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              marks: [
                {
                  type: 'link',
                  attrs: {
                    href: 'https://example.com',
                    target: null,
                    rel: null,
                    title: 'Reference',
                  },
                },
              ],
              text: 'Docs',
            },
          ],
        },
      ],
    })
  })

  it('retains visible text while removing policy-rejected link marks', () => {
    const base = new MarkdownParser(schema(), defaultMarkdownParser.tokenizer, {
      paragraph: {block: 'paragraph'},
      link: {mark: 'link'},
    })
    const rejected = createHyperlinkMarkdownParser(base, {
      policy: createHyperlinkPolicy({validate: () => false}),
    })

    expect(rejected.parse('[Bad](https://example.com)').toJSON()).toEqual({
      type: 'doc',
      content: [{type: 'paragraph', content: [{type: 'text', text: 'Bad'}]}],
    })
  })

  it('keeps the visible label while dropping an unsafe imported link', () => {
    const document = parser().parse('[Bad](javascript:alert)')
    expect(document.textContent).toBe('Bad')
    expect(document.firstChild?.firstChild?.marks).toHaveLength(0)
  })

  it('applies a consumer policy on import without mutating the base parser', () => {
    const base = new MarkdownParser(schema(), defaultMarkdownParser.tokenizer, {
      paragraph: {block: 'paragraph'},
      link: {mark: 'link'},
    })
    const restricted = createHyperlinkMarkdownParser(base, {
      policy: createHyperlinkPolicy({
        validate: decision => decision.href === 'https://allowed.example',
      }),
    })

    expect(restricted.parse('[No](example.com)').textContent).toBe('No')
    expect(restricted.parse('[Yes](allowed.example)').firstChild?.firstChild?.marks).toHaveLength(1)
    expect(base.tokens.link).toEqual({mark: 'link'})
  })
})

describe('Markdown serializer adapter', () => {
  it('serializes safe links, titles, and escaped destinations', () => {
    const document = schema().nodeFromJSON({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Docs',
              marks: [
                {
                  type: 'link',
                  attrs: {
                    href: 'https://example.com/a_(b)',
                    target: null,
                    rel: null,
                    title: 'A "title"',
                  },
                },
              ],
            },
          ],
        },
      ],
    })

    expect(serializer().serialize(document)).toBe(
      '[Docs](https://example.com/a_%28b%29 "A \\"title\\"")',
    )
  })

  it('uses autolink syntax for a plain canonical URL', () => {
    const href = 'https://example.com'
    const document = schema().nodeFromJSON({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: href,
              marks: [
                {
                  type: 'link',
                  attrs: {href, target: null, rel: null, title: null},
                },
              ],
            },
          ],
        },
      ],
    })

    expect(serializer().serialize(document)).toBe(`<${href}>`)
  })

  it('renders unsafe legacy marks as plain visible text', () => {
    const link = schema().marks.link.create({
      href: 'javascript:alert',
      target: null,
      rel: null,
      title: null,
    })
    const paragraph = schema().nodes.paragraph.create(
      null,
      schema().text('Visible', [link]),
    )
    const document = schema().nodes.doc.create(null, paragraph)

    expect(serializer().serialize(document)).toBe('Visible')
  })
})

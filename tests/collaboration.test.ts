import {createEditor, definePlugin, union, type Editor} from 'prosekit/core'
import {defineDoc} from 'prosekit/extensions/doc'
import {defineParagraph} from 'prosekit/extensions/paragraph'
import {defineText} from 'prosekit/extensions/text'
import {collab, receiveTransaction, sendableSteps} from 'prosemirror-collab'
import {Step} from 'prosekit/pm/transform'
import {afterEach, describe, expect, it} from 'vitest'

import {defineHyperlink} from '../src/lib/index.js'

const mounted: Editor[] = []

afterEach(() => {
  for (const editor of mounted.splice(0)) editor.unmount()
  document.body.replaceChildren()
})

function createCollabEditor(
  clientID: number,
  text = '',
  anchor = 1,
  mount = false,
  marks: Array<{type: string; attrs?: Record<string, unknown>}> = [],
) {
  const extension = union(
    defineDoc(),
    defineText(),
    defineParagraph(),
    defineHyperlink(),
    definePlugin(collab({clientID})),
  )
  const editor = createEditor({
    extension,
    defaultContent: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: text ? [{type: 'text', text, ...(marks.length ? {marks} : {})}] : undefined,
        },
      ],
    },
    defaultSelection: {type: 'text', anchor, head: anchor},
  })

  if (mount) {
    const element = document.createElement('div')
    document.body.append(element)
    editor.mount(element)
    mounted.push(editor)
  }
  return editor
}

function typeText(editor: Editor, text: string) {
  const view = editor.view
  const {from, to} = view.state.selection
  const handled = view.someProp('handleTextInput', handler =>
    handler(view, from, to, text, () => view.state.tr.insertText(text, from, to)),
  ) ?? false
  if (!handled) view.dispatch(view.state.tr.insertText(text, from, to))
}

describe('collaboration behavior', () => {
  it('does not synthesize local hyperlink steps when remote text is received', () => {
    const sender = createCollabEditor(1)
    const receiver = createCollabEditor(2)

    expect(
      sender.exec((state, dispatch) => {
        dispatch?.(state.tr.insertText('example.com ', 1))
        return true
      }),
    ).toBe(true)

    const packet = sendableSteps(sender.state)
    expect(packet).not.toBeNull()
    const remoteSteps = packet!.steps.map(step =>
      Step.fromJSON(receiver.schema, step.toJSON()),
    )
    const transaction = receiveTransaction(
      receiver.state,
      remoteSteps,
      remoteSteps.map(() => packet!.clientID),
    )
    receiver.updateState(receiver.state.apply(transaction))

    expect(receiver.state.doc.textContent).toBe('example.com ')
    expect(receiver.state.doc.firstChild?.firstChild?.marks).toHaveLength(0)
    expect(sendableSteps(receiver.state)).toBeNull()
  })

  it('does not enqueue steps for an unchanged link edit', () => {
    const editor = createCollabEditor(4, 'hello', 3, false, [
      {type: 'link', attrs: {href: 'https://example.com'}},
    ])
    const before = editor.state

    expect(editor.commands.updateLink({href: 'https://example.com'})).toBe(true)
    expect(editor.commands.updateLink({text: 'hello'})).toBe(true)
    expect(editor.state).toBe(before)
    expect(sendableSteps(editor.state)).toBeNull()
  })

  it('does produce local collaborative steps for local autolinking', () => {
    const editor = createCollabEditor(3, 'example.com', 12, true)

    typeText(editor, ' ')

    const packet = sendableSteps(editor.state)
    expect(packet).not.toBeNull()
    expect(packet!.steps.length).toBeGreaterThanOrEqual(2)
    expect(editor.state.doc.firstChild?.firstChild?.marks[0]?.type.name).toBe('link')
  })
})

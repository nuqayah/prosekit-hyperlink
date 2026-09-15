import type {Mark, MarkType, ProseMirrorNode} from 'prosekit/pm/model'
import type {EditorState} from 'prosekit/pm/state'

export interface ActiveHyperlinkRange {
  from: number
  to: number
  mark: Mark
}

export function getActiveLink(
  state: EditorState,
  position?: number,
): ActiveHyperlinkRange | null {
  const type = state.schema.marks.link
  const usesSelection = position === undefined
  const resolvedPosition = position ?? state.selection.from
  if (!type || resolvedPosition < 0 || resolvedPosition > state.doc.content.size) return null

  const $position = state.doc.resolve(resolvedPosition)
  const parent = $position.parent
  const offset = $position.parentOffset
  const selectionStartsHere = usesSelection && !state.selection.empty

  let child = parent.childAfter(offset)
  if (child.offset === offset && offset > 0 && !selectionStartsHere) {
    if (offset < parent.content.size) return null
    child = parent.childBefore(offset)
  }

  const node = child.node
  const mark = node?.marks.find(candidate => candidate.type === type)
  if (!node || !mark) return null

  let from = $position.start() + child.offset
  let to = from + node.nodeSize
  for (let index = child.index - 1; index >= 0; index--) {
    const sibling = parent.child(index)
    if (!sibling.marks.some(candidate => candidate.eq(mark))) break
    from -= sibling.nodeSize
  }
  for (let index = child.index + 1; index < parent.childCount; index++) {
    const sibling = parent.child(index)
    if (!sibling.marks.some(candidate => candidate.eq(mark))) break
    to += sibling.nodeSize
  }

  const {selection} = state
  if (
    usesSelection &&
    !selection.empty &&
    (selection.from < from || selection.to > to)
  ) {
    return null
  }
  return {from, to, mark}
}

export function selectionAllowsMark(state: EditorState, type: MarkType): boolean {
  const {selection} = state
  if (selection.empty) return selection.$from.parent.type.allowsMarkType(type)

  let sawInline = false
  let allows = true
  state.doc.nodesBetween(selection.from, selection.to, (node, _position, parent) => {
    if (!node.isInline) return allows
    sawInline = true
    if (!parent?.type.allowsMarkType(type)) allows = false
    return allows
  })
  return sawInline && allows
}

export function isSimpleTextRange(
  doc: ProseMirrorNode,
  from: number,
  to: number,
): boolean {
  const content = doc.slice(from, to).content
  return content.childCount === 1 && Boolean(content.firstChild?.isText)
}

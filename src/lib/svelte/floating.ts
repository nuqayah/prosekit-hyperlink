import type {VirtualElement} from '@floating-ui/dom'
import type {Editor} from 'prosekit/core'
import type {EditorView} from 'prosekit/pm/view'
import type {ActionReturn} from 'svelte/action'

export type DocumentRange = {from: number; to: number}

export function createRangeReference(
  editor: Editor,
  range: DocumentRange,
): VirtualElement | null {
  if (!editor.mounted) return null
  const view = editor.view
  if (
    range.from < 0 ||
    range.to < range.from ||
    range.to > view.state.doc.content.size
  ) {
    return null
  }

  return {
    contextElement: view.dom,
    getBoundingClientRect: () => rangeRect(view, range),
    getClientRects: () => rangeRects(view, range),
  }
}

export function portal(
  node: HTMLElement,
  target?: HTMLElement | false,
): ActionReturn<HTMLElement | false | undefined> {
  if (target === false) return {}

  const destination = target ?? node.ownerDocument.body
  const marker = node.ownerDocument.createComment('prosekit-hyperlink')
  node.parentNode?.insertBefore(marker, node)
  destination.append(node)

  return {
    destroy() {
      if (marker.parentNode) {
        marker.parentNode.insertBefore(node, marker)
        marker.remove()
      } else {
        node.remove()
      }
    },
  }
}

function rangeRect(view: EditorView, range: DocumentRange): DOMRect {
  const domRange = createDOMRange(view, range)
  if (domRange) {
    const rect = domRange.getBoundingClientRect()
    if (rect.width || rect.height) return rect
  }
  return fallbackRect(view, range)
}

function rangeRects(view: EditorView, range: DocumentRange): DOMRect[] {
  const domRange = createDOMRange(view, range)
  const rects = domRange ? Array.from(domRange.getClientRects()) : []
  return rects.length ? rects : [fallbackRect(view, range)]
}

function createDOMRange(view: EditorView, range: DocumentRange): Range | null {
  if (view.isDestroyed || range.from === range.to) return null
  try {
    const start = view.domAtPos(range.from)
    const end = view.domAtPos(range.to)
    const domRange = view.dom.ownerDocument.createRange()
    domRange.setStart(start.node, boundedOffset(start.node, start.offset))
    domRange.setEnd(end.node, boundedOffset(end.node, end.offset))
    return domRange
  } catch {
    return null
  }
}

function boundedOffset(node: Node, offset: number): number {
  const max = node.nodeType === Node.TEXT_NODE
    ? node.textContent?.length ?? 0
    : node.childNodes.length
  return Math.max(0, Math.min(offset, max))
}

function fallbackRect(view: EditorView, range: DocumentRange): DOMRect {
  if (view.isDestroyed) return offscreenRect()
  try {
    const start = view.coordsAtPos(range.from)
    if (range.from === range.to) {
      return new DOMRect(start.left, start.top, 0, start.bottom - start.top)
    }

    const end = view.coordsAtPos(range.to)
    const left = Math.min(start.left, end.left)
    const top = Math.min(start.top, end.top)
    const right = Math.max(start.right, end.right)
    const bottom = Math.max(start.bottom, end.bottom)
    return new DOMRect(left, top, right - left, bottom - top)
  } catch {
    return offscreenRect()
  }
}

function offscreenRect(): DOMRect {
  return new DOMRect(-9999, -9999, 0, 0)
}

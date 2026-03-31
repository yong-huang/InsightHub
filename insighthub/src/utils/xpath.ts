export interface SerializedRange {
  startContainer: string
  endContainer: string
  startOffset: number
  endOffset: number
}

function getXPath(node: Node): string {
  if (node.nodeType === Node.DOCUMENT_NODE) return '/'

  const parts: string[] = []
  let current: Node | null = node
  while (current && current.nodeType !== Node.DOCUMENT_NODE) {
    let index = 1
    let sibling = current.previousSibling
    while (sibling) {
      if (sibling.nodeName === current!.nodeName) index++
      sibling = sibling.previousSibling
    }
    const prefix = current.nodeType === Node.ELEMENT_NODE
      ? current.nodeName.toLowerCase()
      : 'text()'
    parts.unshift(`${prefix}[${index}]`)
    current = current.parentNode
  }
  return '/' + parts.join('/')
}

function getByXPath(doc: Document, xpath: string): Node | null {
  try {
    const result = doc.evaluate(
      xpath, doc, null,
      XPathResult.FIRST_ORDERED_NODE_TYPE, null
    )
    return result.singleNodeValue
  } catch {
    return null
  }
}

export function rangeToXPath(range: Range): SerializedRange {
  return {
    startContainer: getXPath(range.startContainer),
    endContainer: getXPath(range.endContainer),
    startOffset: range.startOffset,
    endOffset: range.endOffset,
  }
}

export function xpathToRange(doc: Document, xpath: SerializedRange): Range | null {
  const startNode = getByXPath(doc, xpath.startContainer)
  const endNode = getByXPath(doc, xpath.endContainer)

  if (!startNode || !endNode) return null

  try {
    const range = doc.createRange()
    range.setStart(startNode, xpath.startOffset)
    range.setEnd(endNode, xpath.endOffset)
    return range
  } catch {
    return null
  }
}

export function findTextRange(doc: Document, text: string): Range | null {
  if (!text) return null

  const body = doc.body
  if (!body) return null

  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const idx = node.textContent?.indexOf(text)
    if (idx !== undefined && idx !== -1) {
      try {
        const range = doc.createRange()
        range.setStart(node, idx)
        range.setEnd(node, idx + text.length)
        return range
      } catch {
        continue
      }
    }
  }
  return null
}

function makeMark(doc: Document, annotationId: string, color: string): HTMLElement {
  const mark = doc.createElement('mark')
  mark.setAttribute('data-annotation-id', annotationId)
  mark.style.backgroundColor = color + '40'
  mark.style.borderBottom = `2px solid ${color}`
  mark.style.borderRadius = '2px'
  mark.style.padding = '1px 2px'
  mark.style.cursor = 'pointer'
  return mark
}

/**
 * Apply a <mark> to a range for initial highlighting (user action).
 * Uses surroundContents for single-node ranges, extractContents for cross-element.
 */
export function applyMarkToRange(range: Range, annotationId: string, color: string): Element {
  const doc = range.commonAncestorContainer.ownerDocument
  const mark = makeMark(doc, annotationId, color)

  try {
    range.surroundContents(mark)
  } catch {
    const fragment = range.extractContents()
    mark.appendChild(fragment)
    range.insertNode(mark)
  }
  return mark
}

/**
 * Safely restore a <mark> from a range without corrupting the DOM.
 * Uses per-text-node splitting instead of extractContents.
 */
export function restoreMarkFromRange(range: Range, annotationId: string, color: string): void {
  const doc = range.startContainer.ownerDocument

  // Single text node — safe to use surroundContents
  if (
    range.startContainer === range.endContainer &&
    range.startContainer.nodeType === Node.TEXT_NODE
  ) {
    const mark = makeMark(doc, annotationId, color)
    try {
      range.surroundContents(mark)
    } catch { /* skip */ }
    return
  }

  // Cross-element range — walk text nodes and split-wrap each segment individually
  const walker = doc.createTreeWalker(
    range.commonAncestorContainer,
    NodeFilter.SHOW_TEXT
  )
  const segments: { node: Text; start: number; end: number }[] = []
  let node: Node | null

  while ((node = walker.nextNode())) {
    if (!range.intersectsNode(node)) continue

    const textNode = node as Text
    const len = textNode.textContent?.length ?? 0
    let start = 0
    let end = len

    if (textNode === range.startContainer) start = range.startOffset
    if (textNode === range.endContainer) end = range.endOffset

    if (start < end) {
      segments.push({ node: textNode, start, end })
    }
  }

  for (const seg of segments) {
    try {
      const mark = makeMark(doc, annotationId, color)
      const after = seg.node.splitText(seg.start)
      const rest = after.splitText(seg.end - seg.start)
      mark.appendChild(after)
      seg.node.parentNode?.insertBefore(mark, rest)
    } catch { /* skip */ }
  }
}

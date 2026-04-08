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

/**
 * Map a position in whitespace-stripped text back to the original text position.
 */
function mapStrippedPos(text: string, strippedPos: number): number {
  let stripped = 0
  for (let i = 0; i < text.length; i++) {
    if (!/\s/.test(text[i])) {
      if (stripped === strippedPos) return i
      stripped++
    }
  }
  return text.length
}

export function findTextRange(doc: Document, text: string): Range | null {
  if (!text) return null

  const body = doc.body
  if (!body) return null

  // Strip whitespace from query for normalized matching
  const strippedQuery = text.replace(/\s+/g, '')
  if (!strippedQuery) return null

  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const content = node.textContent || ''

    // Phase 1: Exact match
    const idx = content.indexOf(text)
    if (idx !== -1) {
      try {
        const range = doc.createRange()
        range.setStart(node, idx)
        range.setEnd(node, idx + text.length)
        return range
      } catch {
        continue
      }
    }

    // Phase 2: Whitespace-normalized match
    const strippedContent = content.replace(/\s+/g, '')
    const strippedIdx = strippedContent.indexOf(strippedQuery)
    if (strippedIdx !== -1) {
      const startOffset = mapStrippedPos(content, strippedIdx)
      const endOffset = mapStrippedPos(content, strippedIdx + strippedQuery.length)
      try {
        const range = doc.createRange()
        range.setStart(node, startOffset)
        range.setEnd(node, endOffset)
        return range
      } catch {
        continue
      }
    }
  }
  return null
}

/**
 * Character-level similarity between two strings (aligned comparison).
 */
function charSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  let matches = 0
  const minLen = Math.min(a.length, b.length)
  for (let i = 0; i < minLen; i++) {
    if (a[i] === b[i]) matches++
  }
  return matches / maxLen
}

/**
 * Fuzzy text range finder using sliding window character similarity.
 * Used as a last resort when exact and whitespace-normalized matching both fail.
 */
export function findTextRangeFuzzy(doc: Document, text: string): Range | null {
  if (!text) return null
  const body = doc.body
  if (!body) return null

  const query = text.replace(/\s+/g, '')
  const queryLen = query.length
  if (queryLen === 0) return null

  const threshold = queryLen <= 15 ? 0.7 : 0.75
  const firstChar = query[0]

  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT)
  let node: Node | null

  let bestRange: Range | null = null
  let bestScore = 0

  while ((node = walker.nextNode())) {
    const content = node.textContent || ''
    const stripped = content.replace(/\s+/g, '')
    const strippedLen = stripped.length

    // Skip nodes with length difference > 50%
    if (strippedLen === 0 || strippedLen < queryLen * 0.5 || strippedLen > queryLen * 1.5) continue

    // Sliding window
    const minWin = Math.max(1, Math.floor(queryLen * 0.8))
    const maxWin = Math.ceil(queryLen * 1.2)

    for (let winSize = minWin; winSize <= maxWin && winSize <= strippedLen; winSize++) {
      for (let pos = 0; pos <= strippedLen - winSize; pos++) {
        // Pre-filter by first character
        if (stripped[pos] !== firstChar) continue

        const window = stripped.slice(pos, pos + winSize)
        const score = charSimilarity(query, window)

        if (score > bestScore) {
          bestScore = score
          const startOffset = mapStrippedPos(content, pos)
          const endOffset = mapStrippedPos(content, pos + winSize)
          try {
            const range = doc.createRange()
            range.setStart(node, startOffset)
            range.setEnd(node, endOffset)
            bestRange = range
          } catch { /* skip */ }
        }
      }
    }
  }

  return bestScore >= threshold ? bestRange : null
}

/**
 * Trim leading/trailing whitespace-only text nodes from a range.
 * Returns a new range that starts at the first non-whitespace character
 * and ends after the last non-whitespace character.
 */
export function trimRangeEdges(range: Range): Range {
  const doc = range.startContainer.ownerDocument
  const walker = doc.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT)

  let firstNonWs: { node: Text; offset: number } | null = null
  let lastNonWs: { node: Text; offset: number } | null = null

  let node: Node | null
  while ((node = walker.nextNode())) {
    if (!range.intersectsNode(node)) continue
    const textNode = node as Text
    const text = textNode.textContent || ''
    let segStart = 0
    let segEnd = text.length
    if (textNode === range.startContainer) segStart = range.startOffset
    if (textNode === range.endContainer) segEnd = range.endOffset
    if (segStart >= segEnd) continue

    const segment = text.slice(segStart, segEnd)
    for (let i = 0; i < segment.length; i++) {
      if (!/\s/.test(segment[i])) {
        if (!firstNonWs) firstNonWs = { node: textNode, offset: segStart + i }
        lastNonWs = { node: textNode, offset: segStart + i + 1 }
      }
    }
  }

  if (!firstNonWs || !lastNonWs) return range

  try {
    const trimmed = doc.createRange()
    trimmed.setStart(firstNonWs.node, firstNonWs.offset)
    trimmed.setEnd(lastNonWs.node, lastNonWs.offset)
    return trimmed
  } catch {
    return range
  }
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
 * Check if a node is inside an SVG element.
 * SVG text nodes cannot be wrapped with HTML <mark> elements — doing so
 * corrupts the SVG DOM and causes text to disappear.
 */
export function isInsideSVG(node: Node): boolean {
  let current: Node | null = node
  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const tag = (current as Element).tagName
      if (tag === 'svg' || tag === 'SVG') return true
      // Stop at the body — if we reached body without finding svg, we're in HTML
      if (tag === 'body' || tag === 'BODY') return false
    }
    current = current.parentNode
  }
  return false
}

/**
 * Apply a <mark> to a range for initial highlighting (user action).
 * Uses surroundContents for single-node ranges, per-text-node splitting for cross-element
 * to avoid extractContents breaking table structures.
 */
export function applyMarkToRange(range: Range, annotationId: string, color: string): Element {
  const doc = range.commonAncestorContainer.ownerDocument

  // Skip SVG text — cannot wrap SVG text nodes with HTML <mark>
  if (isInsideSVG(range.commonAncestorContainer)) {
    return makeMark(doc, annotationId, color)
  }

  // Single text node — safe to use surroundContents
  if (
    range.startContainer === range.endContainer &&
    range.startContainer.nodeType === Node.TEXT_NODE
  ) {
    const mark = makeMark(doc, annotationId, color)
    try {
      range.surroundContents(mark)
    } catch { /* skip */ }
    return mark
  }

  // Cross-element range — use per-text-node splitting (same as restoreMarkFromRange)
  // to avoid extractContents which corrupts table structures
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

  let firstMark: Element | null = null
  for (const seg of segments) {
    try {
      // Safety: skip if the text node has been orphaned
      if (!seg.node.parentNode || !seg.node.parentNode.parentNode) continue

      const mark = makeMark(doc, annotationId, color)
      const textLen = seg.node.textContent?.length ?? 0
      const start = Math.min(seg.start, textLen)
      const splitLen = Math.min(seg.end - seg.start, textLen - start)
      if (splitLen <= 0) continue

      const after = seg.node.splitText(start)
      const rest = after.splitText(splitLen)
      mark.appendChild(after)
      seg.node.parentNode?.insertBefore(mark, rest)
      if (!firstMark) firstMark = mark
    } catch { /* skip */ }
  }

  return firstMark || makeMark(doc, annotationId, color)
}

/**
 * Safely restore a <mark> from a range without corrupting the DOM.
 * Uses per-text-node splitting instead of extractContents.
 */
export function restoreMarkFromRange(range: Range, annotationId: string, color: string): void {
  const doc = range.startContainer.ownerDocument

  // Skip SVG text — cannot wrap SVG text nodes with HTML <mark>
  if (isInsideSVG(range.commonAncestorContainer)) return

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
      if (!seg.node.parentNode || !seg.node.parentNode.parentNode) continue

      const mark = makeMark(doc, annotationId, color)
      const textLen = seg.node.textContent?.length ?? 0
      const start = Math.min(seg.start, textLen)
      const splitLen = Math.min(seg.end - seg.start, textLen - start)
      if (splitLen <= 0) continue

      const after = seg.node.splitText(start)
      const rest = after.splitText(splitLen)
      mark.appendChild(after)
      seg.node.parentNode?.insertBefore(mark, rest)
    } catch { /* skip */ }
  }
}

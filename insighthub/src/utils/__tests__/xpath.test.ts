import { describe, it, expect, beforeEach } from 'vitest'
import {
  rangeToXPath,
  xpathToRange,
  findTextRange,
  findTextRangeFuzzy,
  trimRangeEdges,
  isInsideSVG,
} from '../xpath'

function createDoc(html: string): Document {
  const parser = new DOMParser()
  return parser.parseFromString(html, 'text/html')
}

describe('rangeToXPath / xpathToRange round-trip', () => {
  it('serializes and deserializes a text range', () => {
    const doc = createDoc('<p>Hello world</p>')
    const textNode = doc.querySelector('p')!.firstChild!
    const range = doc.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, 5)

    const serialized = rangeToXPath(range)
    const restored = xpathToRange(doc, serialized)
    expect(restored).not.toBeNull()
    expect(restored!.toString()).toBe('Hello')
  })

  it('round-trip preserves exact boundaries', () => {
    const doc = createDoc('<p>Hello <strong>world</strong> foo</p>')
    const textNode = doc.querySelector('strong')!.firstChild!
    const range = doc.createRange()
    range.setStart(textNode, 1)
    range.setEnd(textNode, 4)

    const serialized = rangeToXPath(range)
    const restored = xpathToRange(doc, serialized)
    expect(restored).not.toBeNull()
    expect(restored!.startOffset).toBe(1)
    expect(restored!.endOffset).toBe(4)
    expect(restored!.toString()).toBe('orl')
  })

  it('returns null for invalid xpath', () => {
    const doc = createDoc('<p>test</p>')
    const result = xpathToRange(doc, {
      startContainer: '/html/body/nonexistent[1]',
      endContainer: '/html/body/nonexistent[1]',
      startOffset: 0,
      endOffset: 4,
    })
    expect(result).toBeNull()
  })
})

describe('findTextRange', () => {
  it('finds exact match in text node', () => {
    const doc = createDoc('<p>Hello world</p>')
    const range = findTextRange(doc, 'Hello')
    expect(range).not.toBeNull()
    expect(range!.toString()).toBe('Hello')
  })

  it('finds match with whitespace normalization', () => {
    const doc = createDoc('<p>Hello   world</p>')
    const range = findTextRange(doc, 'Hello world')
    expect(range).not.toBeNull()
    expect(range!.toString()).toMatch(/Hello\s+world/)
  })

  it('returns null for empty query', () => {
    const doc = createDoc('<p>Hello world</p>')
    expect(findTextRange(doc, '')).toBeNull()
  })

  it('returns null when query not found', () => {
    const doc = createDoc('<p>Hello world</p>')
    expect(findTextRange(doc, 'xyz')).toBeNull()
  })

  it('returns null for empty document', () => {
    const doc = createDoc('<html><body></body></html>')
    expect(findTextRange(doc, 'test')).toBeNull()
  })

  it('finds text across multiple text nodes', () => {
    const doc = createDoc('<p>Hello <em>beautiful</em> world</p>')
    const range = findTextRange(doc, 'Hello')
    expect(range).not.toBeNull()
    expect(range!.toString()).toBe('Hello')
  })
})

describe('findTextRangeFuzzy', () => {
  it('finds fuzzy match with close similarity', () => {
    // Need a longer string where sliding window can find close match above threshold
    const doc = createDoc('<p>machine learning algorithms are important</p>')
    const range = findTextRangeFuzzy(doc, 'machine learning algorithrms')
    expect(range).not.toBeNull()
    expect(range!.toString().trim()).toBeTruthy()
  })

  it('returns null for empty query', () => {
    const doc = createDoc('<p>Hello</p>')
    expect(findTextRangeFuzzy(doc, '')).toBeNull()
  })

  it('returns null when no similar text exists', () => {
    const doc = createDoc('<p>Hello world</p>')
    expect(findTextRangeFuzzy(doc, 'xyzabcdef')).toBeNull()
  })

  it('finds exact match via fuzzy path', () => {
    const doc = createDoc('<p>Python programming</p>')
    const range = findTextRangeFuzzy(doc, 'Python programming')
    expect(range).not.toBeNull()
  })
})

describe('trimRangeEdges', () => {
  it('trims whitespace-only edges from range', () => {
    // Use <span> to ensure the space nodes are preserved in jsdom
    const doc = createDoc('<p><span>Hello</span> <span>world</span></p>')
    const p = doc.querySelector('p')!
    const range = doc.createRange()
    range.setStart(p, 0)
    range.setEnd(p, p.childNodes.length)

    const trimmed = trimRangeEdges(range)
    expect(trimmed.toString()).toBe('Hello world')
  })

  it('returns original range when no whitespace to trim', () => {
    const doc = createDoc('<p>Hello</p>')
    const textNode = doc.querySelector('p')!.firstChild!
    const range = doc.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, 5)

    const trimmed = trimRangeEdges(range)
    expect(trimmed.toString()).toBe('Hello')
  })

  it('handles range that is all whitespace', () => {
    const doc = createDoc('<p>   </p>')
    const textNode = doc.querySelector('p')!.firstChild!
    const range = doc.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, 3)

    // All whitespace → returns original range
    const trimmed = trimRangeEdges(range)
    expect(trimmed.toString()).toBe('   ')
  })
})

describe('isInsideSVG', () => {
  it('detects SVG ancestry', () => {
    const doc = createDoc('<svg><text>Hello</text></svg>')
    const textNode = doc.querySelector('text')!
    expect(isInsideSVG(textNode)).toBe(true)
  })

  it('returns false for non-SVG nodes', () => {
    const doc = createDoc('<p>Hello world</p>')
    const pNode = doc.querySelector('p')!
    expect(isInsideSVG(pNode)).toBe(false)
  })

  it('returns false for deeply nested non-SVG content', () => {
    const doc = createDoc('<div><span><p>text</p></span></div>')
    const pNode = doc.querySelector('p')!
    expect(isInsideSVG(pNode)).toBe(false)
  })

  it('detects SVG ancestry for nested elements', () => {
    const doc = createDoc('<svg><g><text id="t">Hello</text></g></svg>')
    const textNode = doc.querySelector('#t')!
    expect(isInsideSVG(textNode)).toBe(true)
  })
})

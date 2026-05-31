import { describe, it, expect, beforeEach } from 'vitest'
import {
  parseRefs,
  validateRefs,
  loadShadowHistory,
  saveShadowHistory,
  clearShadowHistory,
  type TutorMessage,
} from '../shadowTypingUtils'

describe('parseRefs', () => {
  it('extracts refs from end of string', () => {
    const result = parseRefs('Some text [ref:keyword1, keyword2]')
    expect(result.content).toBe('Some text')
    expect(result.refs).toEqual(['keyword1', 'keyword2'])
  })

  it('returns full text when no refs present', () => {
    const result = parseRefs('Just some regular text')
    expect(result.content).toBe('Just some regular text')
    expect(result.refs).toEqual([])
  })

  it('handles empty string', () => {
    const result = parseRefs('')
    expect(result.content).toBe('')
    expect(result.refs).toEqual([])
  })

  it('trims whitespace after content', () => {
    const result = parseRefs('Hello world   [ref:foo]')
    expect(result.content).toBe('Hello world')
    expect(result.refs).toEqual(['foo'])
  })

  it('trims whitespace around ref values', () => {
    const result = parseRefs('text [ref:  spaced  , out  ]')
    expect(result.refs).toEqual(['spaced', 'out'])
  })

  it('filters empty ref values', () => {
    const result = parseRefs('text [ref:valid,, also]')
    expect(result.refs).toEqual(['valid', 'also'])
  })

  it('does not match ref in middle of string', () => {
    const result = parseRefs('before [ref:foo] after')
    expect(result.content).toBe('before [ref:foo] after')
    expect(result.refs).toEqual([])
  })

  it('handles trailing whitespace after ref', () => {
    const result = parseRefs('text [ref:foo]   ')
    expect(result.content).toBe('text')
    expect(result.refs).toEqual(['foo'])
  })

  it('handles multiple refs with spaces', () => {
    const result = parseRefs('text [ref:first ref, second ref]')
    expect(result.refs).toEqual(['first ref', 'second ref'])
  })
})

describe('localStorage round-trip (shadow history)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('saves and loads messages', () => {
    const messages: TutorMessage[] = [
      { role: 'ai', content: 'Hello' },
      { role: 'user', content: 'Hi there' },
      { role: 'ai', content: 'Great!', refs: ['ref1'] },
    ]
    saveShadowHistory('doc-1', messages)
    expect(loadShadowHistory('doc-1')).toEqual(messages)
  })

  it('limits to last 60 messages', () => {
    const messages: TutorMessage[] = Array.from({ length: 70 }, (_, i) => ({
      role: 'user' as const,
      content: `msg-${i}`,
    }))
    saveShadowHistory('doc-1', messages)
    const loaded = loadShadowHistory('doc-1')
    expect(loaded).toHaveLength(60)
    // Should keep the last 60 (indices 10-69)
    expect(loaded[0].content).toBe('msg-10')
    expect(loaded[59].content).toBe('msg-69')
  })

  it('returns empty for unknown docId', () => {
    expect(loadShadowHistory('unknown-doc')).toEqual([])
  })

  it('handles corrupted data gracefully', () => {
    localStorage.setItem('insighthub:shadow-history', 'not-json{{')
    expect(loadShadowHistory('doc-1')).toEqual([])
  })

  it('handles empty array save', () => {
    saveShadowHistory('doc-1', [])
    expect(loadShadowHistory('doc-1')).toEqual([])
  })

  it('isolates different docIds', () => {
    saveShadowHistory('doc-a', [{ role: 'ai', content: 'A' }])
    saveShadowHistory('doc-b', [{ role: 'ai', content: 'B' }])
    expect(loadShadowHistory('doc-a')).toEqual([{ role: 'ai', content: 'A' }])
    expect(loadShadowHistory('doc-b')).toEqual([{ role: 'ai', content: 'B' }])
  })
})

describe('clearShadowHistory', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('clears one doc and preserves others', () => {
    saveShadowHistory('doc-a', [{ role: 'ai', content: 'A' }])
    saveShadowHistory('doc-b', [{ role: 'ai', content: 'B' }])
    clearShadowHistory('doc-a')
    expect(loadShadowHistory('doc-a')).toEqual([])
    expect(loadShadowHistory('doc-b')).toEqual([{ role: 'ai', content: 'B' }])
  })

  it('does not throw on non-existent docId', () => {
    expect(() => clearShadowHistory('no-such-doc')).not.toThrow()
  })
})

describe('validateRefs', () => {
  const docText = 'The quick brown fox jumps over the lazy dog. Meeting minutes should be distributed promptly.'

  it('keeps exact phrase found in document', () => {
    expect(validateRefs(['quick brown fox'], docText)).toEqual(['quick brown fox'])
  })

  it('is case insensitive', () => {
    expect(validateRefs(['QUICK BROWN FOX'], docText)).toEqual(['QUICK BROWN FOX'])
  })

  it('keeps ref when any significant word (>= 3 chars) is in doc', () => {
    expect(validateRefs(['the meeting agenda'], docText)).toEqual(['the meeting agenda'])
  })

  it('filters short word refs not in document', () => {
    expect(validateRefs(['xy'], docText)).toEqual([])
  })

  it('returns empty for empty refs', () => {
    expect(validateRefs([], docText)).toEqual([])
  })

  it('filters refs not in document with no significant words', () => {
    expect(validateRefs(['ab cd'], docText)).toEqual([])
  })

  it('keeps valid and filters invalid refs', () => {
    expect(validateRefs(['brown fox', 'unknown xyz', 'meeting minutes'], docText)).toEqual([
      'brown fox',
      'meeting minutes',
    ])
  })

  it('handles Chinese characters', () => {
    const chineseDoc = '这是一个关于人工智能的文档'
    expect(validateRefs(['人工智能'], chineseDoc)).toEqual(['人工智能'])
  })
})

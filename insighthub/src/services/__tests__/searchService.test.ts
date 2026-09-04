import { describe, it, expect, beforeEach } from 'vitest'
import {
  parseSearchQuery,
  generateSnippet,
  highlightText,
  applyFilters,
  extendCategoryMap,
  search,
  indexDocument,
  clearIndex,
} from '../searchService'
import type { SearchResult } from '@/types'

describe('parseSearchQuery', () => {
  it('returns plain text when no filters', () => {
    const result = parseSearchQuery('hello world')
    expect(result.text).toBe('hello world')
    expect(result.filters).toEqual({})
  })

  it('parses category: filter', () => {
    const result = parseSearchQuery('test category:networking')
    expect(result.text).toBe('test')
    expect(result.filters.category).toBe('networking')
  })

  it('parses is:read filter', () => {
    const result = parseSearchQuery('something is:read')
    expect(result.text).toBe('something')
    expect(result.filters.isRead).toBe(true)
  })

  it('parses is:unread filter', () => {
    const result = parseSearchQuery('is:unread query')
    expect(result.text).toBe('query')
    expect(result.filters.isRead).toBe(false)
  })

  it('parses has:note filter', () => {
    const result = parseSearchQuery('topic has:note')
    expect(result.text).toBe('topic')
    expect(result.filters.hasAnnotation).toBe(true)
  })

  it('parses has:annotation filter', () => {
    const result = parseSearchQuery('topic has:annotation')
    expect(result.filters.hasAnnotation).toBe(true)
  })

  it('parses source: filter', () => {
    const result = parseSearchQuery('search source:tech')
    expect(result.text).toBe('search')
    expect(result.filters.source).toBe('tech')
  })

  it('handles multiple filters', () => {
    const result = parseSearchQuery('test is:read category:python source:mi')
    expect(result.text).toBe('test')
    expect(result.filters.isRead).toBe(true)
    expect(result.filters.category).toBe('python')
    expect(result.filters.source).toBe('mi')
  })

  it('ignores unknown filters as text', () => {
    const result = parseSearchQuery('foo unknown:bar')
    expect(result.text).toBe('foo unknown:bar')
  })

  it('handles empty string', () => {
    const result = parseSearchQuery('')
    expect(result.text).toBe('')
    expect(result.filters).toEqual({})
  })

  it('category: uses registered label→key mapping for single-word labels', () => {
    extendCategoryMap([{ key: 'net-protocols', label: 'Networking' }])
    const result = parseSearchQuery('category:Networking')
    expect(result.filters.category).toBe('net-protocols')
  })

  it('category: falls back to raw value if not in map', () => {
    const result = parseSearchQuery('category:unknown-cat')
    expect(result.filters.category).toBe('unknown-cat')
  })
})

describe('generateSnippet', () => {
  it('centers snippet around match', () => {
    const content = 'The quick brown fox jumps over the lazy dog in the field.'
    const snippet = generateSnippet(content, 'fox', 30)
    expect(snippet).toContain('fox')
  })

  it('returns prefix when no match found', () => {
    const content = 'Hello world this is a long sentence for testing.'
    const snippet = generateSnippet(content, 'notfound', 20)
    // maxLen=20 → slice(0, 20) = "Hello world this is " (20 chars) + "..."
    expect(snippet).toContain('Hello world this is')
    expect(snippet).toContain('...')
  })

  it('returns empty string for empty content', () => {
    expect(generateSnippet('', 'test')).toBe('')
  })

  it('returns empty string for empty query', () => {
    expect(generateSnippet('some text', '')).toBe('')
  })

  it('returns full content when shorter than maxLen', () => {
    const content = 'Short text'
    const snippet = generateSnippet(content, 'Short', 100)
    expect(snippet).toBe('Short text')
  })

  it('adds ellipsis at start and end when snippet is in middle', () => {
    const content = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh'
    const snippet = generateSnippet(content, 'dddd', 15)
    expect(snippet.startsWith('...')).toBe(true)
    expect(snippet.endsWith('...')).toBe(true)
    expect(snippet).toContain('dddd')
  })
})

describe('highlightText', () => {
  it('wraps match in delimiters', () => {
    const result = highlightText('hello world', 'world')
    expect(result).toBe('hello ⫷world⫸')
  })

  it('is case insensitive', () => {
    const result = highlightText('Hello World', 'hello')
    expect(result).toBe('⫷Hello⫸ World')
  })

  it('escapes regex special characters', () => {
    const result = highlightText('file.txt', 'file.txt')
    expect(result).toBe('⫷file.txt⫸')
  })

  it('handles empty text', () => {
    expect(highlightText('', 'test')).toBe('')
  })

  it('handles empty query', () => {
    expect(highlightText('hello', '')).toBe('hello')
  })

  it('handles multiple matches', () => {
    const result = highlightText('test test test', 'test')
    expect(result).toBe('⫷test⫸ ⫷test⫸ ⫷test⫸')
  })
})

describe('applyFilters', () => {
  const results: SearchResult[] = [
    { id: '1', title: 'Doc1', category: 'python', source: 'mi', score: 5 },
    { id: '2', title: 'Doc2', category: 'networking', source: 'ti', score: 5 },
    { id: '3', title: 'Doc3', category: 'python', source: 'ti', score: 5 },
  ]

  it('returns all when no filters', () => {
    const filtered = applyFilters(results, {}, new Map())
    expect(filtered).toHaveLength(3)
  })

  it('filters by source', () => {
    const filtered = applyFilters(results, { source: 'mi' }, new Map())
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('1')
  })

  it('filters by category', () => {
    const filtered = applyFilters(results, { category: 'python' }, new Map())
    expect(filtered).toHaveLength(2)
  })

  it('filters by tag via docMap', () => {
    const docMap = new Map([
      ['1', { tags: ['important'] }],
      ['2', { tags: ['review'] }],
      ['3', { tags: ['important'] }],
    ])
    const filtered = applyFilters(results, { tag: 'important' }, docMap)
    expect(filtered).toHaveLength(2)
    expect(filtered.map(r => r.id)).toEqual(['1', '3'])
  })

  it('filters by isRead via docMap', () => {
    const docMap = new Map([
      ['1', { isRead: true }],
      ['2', { isRead: false }],
      ['3', { isRead: true }],
    ])
    const filtered = applyFilters(results, { isRead: true }, docMap)
    expect(filtered).toHaveLength(2)
  })

  it('combines multiple filters', () => {
    const docMap = new Map([
      ['1', { isRead: true }],
      ['2', { isRead: false }],
      ['3', { isRead: true }],
    ])
    const filtered = applyFilters(results, { category: 'python', isRead: true }, docMap)
    expect(filtered).toHaveLength(2)
    expect(filtered.map(r => r.id)).toEqual(['1', '3'])
  })
})

describe('extendCategoryMap', () => {
  beforeEach(() => {
    // categoryLabelToKey is a module-level Map that persists between tests.
    // We test additive behavior since there's no clear function exported.
  })

  it('maps label→key and key→key', () => {
    // After calling extendCategoryMap, parseSearchQuery should resolve label
    extendCategoryMap([{ key: 'ai-ml', label: 'AIML' }])
    const result = parseSearchQuery('category:AIML')
    expect(result.filters.category).toBe('ai-ml')
  })

  it('key also maps to itself', () => {
    extendCategoryMap([{ key: 'web-dev', label: 'Web Dev' }])
    const result = parseSearchQuery('category:web-dev')
    expect(result.filters.category).toBe('web-dev')
  })
})

describe('search', () => {
  beforeEach(() => {
    clearIndex()
  })

  const baseDoc = { category: 'algo', source: 'li' }

  it('ranks exact token matches above prefix matches', async () => {
    await indexDocument({ id: 'doc-220', title: 'Problem 220 Solution', contentText: 'Solution for problem #220.', ...baseDoc })
    await indexDocument({ id: 'doc-22', title: 'Problem 22 Notes', contentText: 'Discussion of problem #22 and its approach.', ...baseDoc })

    const results = await search('#22', 10)
    expect(results[0].id).toBe('doc-22')
    // Prefix matches are still recalled, just ranked lower
    expect(results.map(r => r.id)).toContain('doc-220')
  })

  it('exact content match is not crowded out by many prefix matches', async () => {
    // The exact "#22" doc has it only in content; 40+ docs match the "22" prefix
    await indexDocument({ id: 'doc-22b', title: 'Stack Uses', contentText: 'Problem #22 uses a stack of pairs.', ...baseDoc })
    for (let i = 220; i < 260; i++) {
      // Numbers only in content — titles stay generic so this isolates the flood
      await indexDocument({ id: `doc-${i}`, title: `Solution Notes ${i % 10}`, contentText: `Solution for problem #${i} with details.`, ...baseDoc })
    }

    const results = await search('#22', 30)
    expect(results[0].id).toBe('doc-22b')
  })

  it('numeric family (220-229) ranks right after exact matches, before generic mentions', async () => {
    // 40 unrelated docs whose content merely mentions "22" — they used to flood
    // the exact tier and push the whole "22x" number family out of the results
    for (let i = 0; i < 40; i++) {
      await indexDocument({ id: `other-${i}`, title: `Book Volume ${i}`, contentText: `Notes about topic ${i}, see chapter 22 for details.`, ...baseDoc })
    }
    await indexDocument({ id: 'li-22', title: '22. Generate Parentheses', contentText: 'Problem 22 solution.', ...baseDoc })
    for (let n = 220; n <= 260; n++) {
      await indexDocument({ id: `li-${n}`, title: `${n}. Problem ${n}`, contentText: `Solution for problem ${n}.`, ...baseDoc })
    }

    const results = await search('#22', 30)
    const ids = results.map(r => r.id)
    expect(ids[0]).toBe('li-22')
    // The 22x family is present and ranked directly after the exact match
    expect(ids.indexOf('li-220')).toBeGreaterThan(0)
    expect(ids.indexOf('li-220')).toBeLessThanOrEqual(11)
    // ...ahead of the generic "mentions 22 in content" docs
    expect(ids.indexOf('li-220')).toBeLessThan(ids.indexOf('other-0'))
    // 230+ are not part of the "22" prefix family
    expect(ids).not.toContain('li-230')
  })

  it('searching a longer number surfaces its own family after the exact match', async () => {
    await indexDocument({ id: 'li-22', title: '22. Generate Parentheses', contentText: 'About #22.', ...baseDoc })
    await indexDocument({ id: 'li-220', title: '220. Contains Duplicate III', contentText: 'About #220.', ...baseDoc })
    await indexDocument({ id: 'li-2200', title: '2200. Find All K-Distant Indices', contentText: 'About #2200.', ...baseDoc })

    const results = await search('#220', 10)
    const ids = results.map(r => r.id)
    expect(ids[0]).toBe('li-220')
    // 2200 belongs to the "220" prefix family — still visible, ranked after
    expect(ids).toContain('li-2200')
    // "22" is not a match for the query "220" at all
    expect(ids).not.toContain('li-22')
  })

  it('word queries keep exact matches above prefix matches', async () => {
    // Non-numeric queries are not affected by the numeric-family tiers:
    // an exact content hit must outrank a near-prefix hit
    await indexDocument({ id: 'exact-hook', title: 'React Guide', contentText: 'Everything about the hook pattern.', ...baseDoc })
    await indexDocument({ id: 'prefix-hooks', title: 'Hooks Manual', contentText: 'Using hooks effectively.', ...baseDoc })

    const results = await search('hook', 10)
    expect(results[0].id).toBe('exact-hook')
    expect(results.map(r => r.id)).toContain('prefix-hooks')
  })

  it('exact title match outranks exact content match', async () => {
    await indexDocument({ id: 'content-hit', title: 'Unrelated Title', contentText: 'Mentions #22 once.', ...baseDoc })
    await indexDocument({ id: 'title-hit', title: 'Guide to 22', contentText: 'Some other content entirely.', ...baseDoc })

    const results = await search('22', 10)
    expect(results[0].id).toBe('title-hit')
    expect(results[1].id).toBe('content-hit')
  })

  it('falls back to prefix matches when no exact match exists', async () => {
    await indexDocument({ id: 'doc-220', title: 'Problem 220 Solution', contentText: 'Solution for problem #220.', ...baseDoc })

    const results = await search('#22', 10)
    expect(results.map(r => r.id)).toContain('doc-220')
  })

  it('searching the longer number ranks its exact doc first', async () => {
    await indexDocument({ id: 'doc-22', title: 'Problem 22 Notes', contentText: 'About #22.', ...baseDoc })
    await indexDocument({ id: 'doc-220', title: 'Problem 220 Solution', contentText: 'About #220.', ...baseDoc })

    const results = await search('#220', 10)
    expect(results[0].id).toBe('doc-220')
  })

  it('returns empty array for empty or blank query', async () => {
    await indexDocument({ id: 'doc-1', title: 'Something', contentText: 'Content here.', ...baseDoc })
    expect(await search('', 10)).toEqual([])
    expect(await search('   ', 10)).toEqual([])
  })

  it('returns empty array when index is empty', async () => {
    expect(await search('anything', 10)).toEqual([])
  })
})

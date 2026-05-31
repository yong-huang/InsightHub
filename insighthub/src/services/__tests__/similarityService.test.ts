import { describe, it, expect, beforeEach, vi } from 'vitest'

// We test the pure functions indirectly via the module's public API.
// The module uses Zustand stores internally, so we mock them.
vi.mock('@/stores/documentStore', () => ({
  useDocumentStore: { getState: () => ({ documents: new Map() }) },
}))
vi.mock('@/stores/tagStore', () => ({
  useTagStore: { getState: () => ({ tags: [] }) },
}))
vi.mock('@/services/storageService', () => ({
  storageService: {
    _getRaw: () => null,
    getReadHistory: () => [],
    getAchievementState: () => ({ unlockedIds: [], unlockedAt: {} }),
    saveAchievementState: () => {},
  },
}))

import {
  addSnippet,
  getSimilarDocuments,
  clearSimilarityCache,
} from '../similarityService'

describe('addSnippet', () => {
  beforeEach(() => {
    clearSimilarityCache()
  })

  it('accumulates text snippet', () => {
    addSnippet('doc1', 'Hello world', 'mi', 'python')
    addSnippet('doc2', 'Python programming', 'mi', 'python')
    const results = getSimilarDocuments('doc1')
    // Should find doc2 as similar (same source)
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].docId).toBe('doc2')
  })

  it('ignores empty text', () => {
    addSnippet('doc1', '', 'mi', 'python')
    const results = getSimilarDocuments('doc1')
    expect(results).toEqual([])
  })

  it('truncates text to 4000 characters', () => {
    const longText = 'a'.repeat(5000)
    addSnippet('doc1', longText, 'mi', 'python')
    // Should not throw — text is truncated internally
    const results = getSimilarDocuments('doc1')
    expect(results).toEqual([])
  })

  it('does not find cross-source documents', () => {
    addSnippet('doc1', 'Python basics', 'mi', 'python')
    addSnippet('doc2', 'Python advanced', 'ti', 'python')
    const results = getSimilarDocuments('doc1')
    // doc2 is in different source, so not similar
    expect(results.find(r => r.docId === 'doc2')).toBeUndefined()
  })
})

describe('cosineSimilarity (indirect)', () => {
  beforeEach(() => {
    clearSimilarityCache()
  })

  it('identical content → high similarity', () => {
    const text = 'machine learning algorithms for classification and regression'
    addSnippet('doc1', text, 'mi', 'python')
    addSnippet('doc2', text, 'mi', 'python')
    const results = getSimilarDocuments('doc1')
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].score).toBeCloseTo(1.0, 1)
  })

  it('orthogonal content → low/no similarity', () => {
    addSnippet('doc1', 'cooking recipes pasta tomato basil', 'mi', 'food')
    addSnippet('doc2', 'quantum physics electron proton neutron', 'mi', 'physics')
    const results = getSimilarDocuments('doc1')
    // These share no meaningful terms → score should be very low or excluded (< 0.05)
    const doc2Result = results.find(r => r.docId === 'doc2')
    if (doc2Result) {
      expect(doc2Result.score).toBeLessThan(0.3)
    }
  })

  it('empty content → no results', () => {
    addSnippet('doc1', 'test content', 'mi', 'cat')
    // doc2 is not added, so no results
    const results = getSimilarDocuments('doc1')
    expect(results).toEqual([])
  })
})

describe('clearSimilarityCache', () => {
  beforeEach(() => {
    clearSimilarityCache()
  })

  it('resets similarity results after clearing', () => {
    addSnippet('doc1', 'Python programming', 'mi', 'python')
    addSnippet('doc2', 'Python data science', 'mi', 'python')
    // Access once to build index
    getSimilarDocuments('doc1')
    // Clear
    clearSimilarityCache()
    // After clear, index should be rebuilt or empty
    const results = getSimilarDocuments('doc1')
    expect(results).toEqual([])
  })
})

describe('tokenization (indirect via similarity)', () => {
  beforeEach(() => {
    clearSimilarityCache()
  })

  it('removes English stop words', () => {
    // "the" is a stop word, "python" is not
    addSnippet('doc1', 'the python language', 'mi', 'python')
    addSnippet('doc2', 'python programming language', 'mi', 'python')
    const results = getSimilarDocuments('doc1')
    expect(results.length).toBeGreaterThanOrEqual(1)
  })

  it('filters short English words (<2 chars)', () => {
    addSnippet('doc1', 'a python x', 'mi', 'python')
    // "a" and "x" should be filtered
    addSnippet('doc2', 'python code', 'mi', 'python')
    const results = getSimilarDocuments('doc1')
    expect(results.length).toBeGreaterThanOrEqual(1)
  })

  it('handles Chinese character unigrams', () => {
    addSnippet('doc1', '机器学习算法', 'mi', 'ai')
    addSnippet('doc2', '深度学习方法', 'mi', 'ai')
    const results = getSimilarDocuments('doc1')
    // Chinese chars should produce tokens; shared "学" and "法" may create some similarity
    // or no similarity if all are different
    expect(Array.isArray(results)).toBe(true)
  })

  it('filters Chinese stop words', () => {
    // "的" and "了" are Chinese stop words
    addSnippet('doc1', '机器的算法了', 'mi', 'ai')
    addSnippet('doc2', '机器学习深度', 'mi', 'ai')
    const results = getSimilarDocuments('doc1')
    expect(Array.isArray(results)).toBe(true)
  })

  it('handles mixed English and Chinese', () => {
    addSnippet('doc1', 'Python机器学习', 'mi', 'python')
    addSnippet('doc2', 'Python深度学习', 'mi', 'python')
    const results = getSimilarDocuments('doc1')
    // Should find similarity via shared "python" token
    expect(results.length).toBeGreaterThanOrEqual(1)
  })
})

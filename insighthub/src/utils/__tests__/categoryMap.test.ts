import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerDynamicCategories,
  getRegisteredCategories,
  getCategoryInfo,
  getSourceFromCategory,
} from '../categoryMap'
import type { Source } from '@/types'

describe('registerDynamicCategories', () => {
  beforeEach(() => {
    // categoryMap uses a module-level Map with no clear function.
    // We register unique keys per test to avoid cross-test interference.
  })

  it('adds new entries', () => {
    registerDynamicCategories([{ key: 'test-python', source: 'mi' }])
    const cats = getRegisteredCategories()
    const found = cats.find(c => c.key === 'test-python')
    expect(found).toBeDefined()
    expect(found!.source).toBe('mi')
    expect(found!.icon).toBe('Folder')
  })

  it('skips duplicates', () => {
    registerDynamicCategories([{ key: 'test-dup-unique', source: 'mi' }])
    registerDynamicCategories([{ key: 'test-dup-unique', source: 'ti' }])
    const cats = getRegisteredCategories()
    const entries = cats.filter(c => c.key === 'test-dup-unique')
    expect(entries).toHaveLength(1)
    expect(entries[0].source).toBe('mi') // first registration wins
  })

  it('converts hyphenated keys to titleCase', () => {
    registerDynamicCategories([{ key: 'net-protocols', source: 'ti' }])
    const info = getCategoryInfo('net-protocols')
    expect(info.label).toBe('Net Protocols')
  })

  it('handles multi-part hyphenated keys', () => {
    registerDynamicCategories([{ key: 'deep-learning-models', source: 'mi' }])
    const info = getCategoryInfo('deep-learning-models')
    expect(info.label).toBe('Deep Learning Models')
  })
})

describe('getRegisteredCategories', () => {
  it('returns all registered entries', () => {
    registerDynamicCategories([
      { key: 'cat-a-unique', source: 'mi' },
      { key: 'cat-b-unique', source: 'ti' },
    ])
    const cats = getRegisteredCategories()
    expect(cats.find(c => c.key === 'cat-a-unique')).toBeDefined()
    expect(cats.find(c => c.key === 'cat-b-unique')).toBeDefined()
  })
})

describe('getCategoryInfo', () => {
  it('returns registered entry', () => {
    registerDynamicCategories([{ key: 'info-test-key', source: 'mi' }])
    const info = getCategoryInfo('info-test-key')
    expect(info.key).toBe('info-test-key')
    expect(info.source).toBe('mi')
    expect(info.label).toBe('Info Test Key')
  })

  it('returns titleCase fallback for unknown key', () => {
    const info = getCategoryInfo('unknown-category-key')
    expect(info.key).toBe('unknown-category-key')
    expect(info.label).toBe('Unknown Category Key')
    expect(info.source).toBe('')
  })

  it('handles single-word unknown key', () => {
    const info = getCategoryInfo('python')
    expect(info.label).toBe('Python')
  })
})

describe('getSourceFromCategory', () => {
  it('finds source from document map', () => {
    const docMap = new Map([
      ['doc1', { source: 'mi', category: 'python' }],
    ])
    const source = getSourceFromCategory('python', docMap)
    expect(source).toBe('mi')
  })

  it('falls back to categoryInfo when no documents match', () => {
    const docMap = new Map<string, { source: Source; category: string }>()
    registerDynamicCategories([{ key: 'fallback-src-test', source: 'ti' }])
    const source = getSourceFromCategory('fallback-src-test', docMap)
    expect(source).toBe('ti')
  })

  it('falls back to empty string when category not registered', () => {
    const source = getSourceFromCategory('nonexistent')
    expect(source).toBe('')
  })
})

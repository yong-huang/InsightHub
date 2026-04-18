import { Document } from 'flexsearch'
import type { SearchResult, SearchFilters, Source } from '@/types'
import { CATEGORIES } from '@/utils/categoryMap'

let searchIndex: Document | null = null

function createIndex(): Document {
  const index = new Document({
    tokenize: 'forward',
    cache: 100,
    document: {
      id: 'id',
      index: ['title', 'content'],
      store: ['title', 'category', 'source', 'content'],
    },
    charset: {
      Latin: 'C:0-255,A:192-255',
      CJK: 'CJK:0-65535'
    },
    context: {
      resolution: 9,
      depth: 2,
      bidirectional: true,
    },
  })
  return index
}

export async function indexDocument(doc: {
  id: string
  title: string
  contentText: string
  category: string
  source: Source
}): Promise<void> {
  if (!searchIndex) {
    searchIndex = createIndex()
  }
  const truncatedContent = doc.contentText.slice(0, 8000)
  await searchIndex.add(doc.id, {
    title: doc.title,
    content: truncatedContent,
    category: doc.category,
    source: doc.source,
  })
}

export function generateSnippet(content: string, query: string, maxLen = 120): string {
  if (!content || !query) return ''
  const lower = content.toLowerCase()
  const qLower = query.toLowerCase()
  const idx = lower.indexOf(qLower)
  if (idx === -1) return content.slice(0, maxLen) + (content.length > maxLen ? '...' : '')

  const halfCtx = Math.floor(maxLen / 2)
  const start = Math.max(0, idx - halfCtx)
  const end = Math.min(content.length, idx + query.length + halfCtx)
  let snippet = content.slice(start, end)
  if (start > 0) snippet = '...' + snippet
  if (end < content.length) snippet = snippet + '...'
  return snippet
}

export function highlightText(text: string, query: string): string {
  if (!text || !query) return text
  // Escape regex special chars
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  return text.replace(regex, '⫷$1⫸')
}

export interface ParsedQuery {
  text: string
  filters: {
    category?: string
    source?: Source
    isRead?: boolean
    hasAnnotation?: boolean
  }
}

// Build reverse map: label→key for category matching (e.g. "哲学"→"philosophy")
const categoryLabelToKey = new Map<string, string>()
for (const c of CATEGORIES) {
  categoryLabelToKey.set(c.label, c.key)
  categoryLabelToKey.set(c.key, c.key)
}

export function parseSearchQuery(raw: string): ParsedQuery {
  const tokens = raw.trim().split(/\s+/)
  const textParts: string[] = []
  const filters: ParsedQuery['filters'] = {}

  for (const token of tokens) {
    if (token.startsWith('category:')) {
      const val = token.slice('category:'.length)
      filters.category = categoryLabelToKey.get(val) || val
    } else if (token.startsWith('is:')) {
      const val = token.slice('is:'.length).toLowerCase()
      if (val === 'read') filters.isRead = true
      else if (val === 'unread') filters.isRead = false
    } else if (token.startsWith('has:')) {
      const val = token.slice('has:'.length).toLowerCase()
      if (val === 'note' || val === 'annotation') filters.hasAnnotation = true
    } else if (token.startsWith('source:')) {
      const val = token.slice('source:'.length).toLowerCase()
      if (val === 'mindinsight') filters.source = 'mindinsight'
      else if (val === 'techinsight') filters.source = 'techinsight'
      else if (val === 'leetcodeinsight') filters.source = 'leetcodeinsight'
    } else {
      textParts.push(token)
    }
  }

  return { text: textParts.join(' '), filters }
}

export async function search(
  query: string,
  limit = 20
): Promise<SearchResult[]> {
  if (!searchIndex) return []
  if (!query.trim()) return []

  try {
    const results: SearchResult[] = []

    // Search title
    const titleResults = await searchIndex.search(query, {
      index: 'title',
      limit: limit,
      enrich: true,
    })
    if (Array.isArray(titleResults) && titleResults.length > 0) {
      for (const group of titleResults) {
        for (const result of group.result) {
          if (!results.find(r => r.id === result.id)) {
            const content: string = result.doc?.content || ''
            results.push({
              id: result.id,
              title: result.doc?.title || result.id,
              category: result.doc?.category || '',
              source: result.doc?.source || 'techinsight',
              score: 10,
              snippet: generateSnippet(content, query),
            })
          }
        }
      }
    }

    // Search content
    const contentResults = await searchIndex.search(query, {
      index: 'content',
      limit: limit,
      enrich: true,
    })
    if (Array.isArray(contentResults) && contentResults.length > 0) {
      for (const group of contentResults) {
        for (const result of group.result) {
          if (!results.find(r => r.id === result.id)) {
            const content: string = result.doc?.content || ''
            results.push({
              id: result.id,
              title: result.doc?.title || result.id,
              category: result.doc?.category || '',
              source: result.doc?.source || 'techinsight',
              score: 5,
              snippet: generateSnippet(content, query),
            })
          }
        }
      }
    }

    return results.slice(0, limit)
  } catch (e) {
    console.error('Search error:', e)
    return []
  }
}

export function applyFilters(
  results: SearchResult[],
  filters: SearchFilters,
  docMap: Map<string, any>
): SearchResult[] {
  let filtered = [...results]

  if (filters.source) {
    filtered = filtered.filter(r => r.source === filters.source)
  }
  if (filters.category) {
    filtered = filtered.filter(r => r.category === filters.category)
  }
  if (filters.tag) {
    filtered = filtered.filter(r => {
      const doc = docMap.get(r.id)
      return doc?.tags?.includes(filters.tag)
    })
  }
  if (filters.isRead !== undefined && filters.isRead !== null) {
    filtered = filtered.filter(r => {
      const doc = docMap.get(r.id)
      return doc?.isRead === filters.isRead
    })
  }

  return filtered
}

export async function suggestTitles(query: string, limit = 5): Promise<string[]> {
  if (!searchIndex || !query.trim()) return []
  try {
    const results = await searchIndex.search(query, {
      index: 'title',
      limit,
      enrich: true,
    })
    const titles: string[] = []
    if (Array.isArray(results) && results.length > 0) {
      for (const group of results) {
        for (const r of group.result) {
          if (r.doc?.title) titles.push(r.doc.title)
        }
      }
    }
    return titles.slice(0, limit)
  } catch {
    return []
  }
}

export function clearIndex(): void {
  searchIndex = null
}

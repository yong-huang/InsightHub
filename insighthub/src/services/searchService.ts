import { Document } from 'flexsearch'
import type { SearchResult, SearchFilters, Source, Document as AppDocument } from '@/types'

let searchIndex: Document | null = null
export let isIndexing = false

export function setIsIndexing(value: boolean): void {
  isIndexing = value
}

function createIndex(): Document {
  const index = new Document({
    tokenize: 'forward',
    cache: 100,
    document: {
      id: 'id',
      index: ['title', 'content'],
      store: ['title', 'category', 'source', 'snippet'],
    },
    context: {
      resolution: 9,
      depth: 2,
      bidirectional: true,
    },
  })
  return index
}

// Amount of content to keep in FlexSearch store for snippet generation (~200 chars per doc)
const STORE_SNIPPET_LENGTH = 200

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
  // Store a short excerpt for snippet generation instead of full content
  const storeSnippet = truncatedContent.length > STORE_SNIPPET_LENGTH
    ? truncatedContent.slice(0, STORE_SNIPPET_LENGTH) + '...'
    : truncatedContent
  await searchIndex.add(doc.id, {
    title: doc.title,
    content: truncatedContent,
    category: doc.category,
    source: doc.source,
    snippet: storeSnippet,
  })
}

// Build reverse map: label→key for category matching
const categoryLabelToKey = new Map<string, string>()

/** Extend the category label→key map with dynamic categories (call after documents load) */
export function extendCategoryMap(entries: { key: string; label: string }[]): void {
  for (const entry of entries) {
    categoryLabelToKey.set(entry.label, entry.key)
    categoryLabelToKey.set(entry.key, entry.key)
  }
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
    rating?: number
  }
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
      if (val) filters.source = val
    } else if (token.startsWith('rating:')) {
      const val = parseInt(token.slice('rating:'.length), 10)
      if (val >= 0 && val <= 5) filters.rating = val
    } else if (token === 'unrated') {
      filters.rating = 0
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
          const id = String(result.id)
          const doc = result.doc as Record<string, string | undefined> | undefined
          if (!results.find(r => r.id === id)) {
            const snippet: string = doc?.snippet || ''
            results.push({
              id,
              title: doc?.title || id,
              category: doc?.category || '',
              source: doc?.source || '',
              score: 10,
              snippet: generateSnippet(snippet, query),
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
          const id = String(result.id)
          const doc = result.doc as Record<string, string | undefined> | undefined
          if (!results.find(r => r.id === id)) {
            const snippet: string = doc?.snippet || ''
            results.push({
              id,
              title: doc?.title || id,
              category: doc?.category || '',
              source: doc?.source || '',
              score: 5,
              snippet: generateSnippet(snippet, query),
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
  docMap: Map<string, Partial<AppDocument>>
): SearchResult[] {
  let filtered = [...results]

  if (filters.source) {
    filtered = filtered.filter(r => r.source === filters.source)
  }
  if (filters.category) {
    filtered = filtered.filter(r => r.category === filters.category)
  }
  if (filters.tag) {
    const tag = filters.tag
    filtered = filtered.filter(r => {
      const doc = docMap.get(r.id)
      return doc?.tags?.includes(tag)
    })
  }
  if (filters.isRead !== undefined && filters.isRead !== null) {
    filtered = filtered.filter(r => {
      const doc = docMap.get(r.id)
      return doc?.isRead === filters.isRead
    })
  }
  if (filters.rating !== undefined) {
    if (filters.rating === 0) {
      filtered = filtered.filter(r => {
        const doc = docMap.get(r.id)
        return !doc?.rating
      })
    } else {
      filtered = filtered.filter(r => {
        const doc = docMap.get(r.id)
        return (doc?.rating || 0) >= filters.rating!
      })
    }
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
          const doc = r.doc as Record<string, string | undefined> | undefined
          if (doc?.title) titles.push(String(doc.title))
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

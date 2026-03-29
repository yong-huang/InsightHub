import { Document } from 'flexsearch'
import type { SearchResult, SearchFilters } from '@/types'

let searchIndex: Document | null = null

function createIndex(): Document {
  const index = new Document({
    tokenize: 'forward',
    cache: 100,
    document: {
      id: 'id',
      index: ['title', 'content'],
      store: ['title', 'category', 'source'],
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
  source: 'mindinsight' | 'techinsight'
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
            results.push({
              id: result.id,
              title: result.doc?.title || result.id,
              category: result.doc?.category || '',
              source: result.doc?.source || 'techinsight',
              score: 10,
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
            results.push({
              id: result.id,
              title: result.doc?.title || result.id,
              category: result.doc?.category || '',
              source: result.doc?.source || 'techinsight',
              score: 5,
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

export function clearIndex(): void {
  searchIndex = null
}


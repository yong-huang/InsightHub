import { Document, Encoder } from 'flexsearch'
import type { SearchResult, SearchFilters, Source, Document as AppDocument } from '@/types'

// Prefix index (forward): "22" also recalls "220" — used for broad candidate recall
let searchIndex: Document | null = null
// Exact index (strict): "22" only matches the full token "22" — used to rank
// exact matches ("#22") above prefix matches ("#220", "#221")
let exactIndex: Document | null = null

export let isIndexing = false

export function setIsIndexing(value: boolean): void {
  isIndexing = value
}

// The default FlexSearch encoder collapses consecutive duplicate characters
// (dedupe), which mangles numbers: "22" → "2", "220" → "20", "222" → "2".
// That makes "#22" indistinguishable from "#220"/"#221" at the token level.
// Disabling dedupe keeps numeric tokens precise; word behavior is unchanged.
const encoder = new Encoder({ dedupe: false })

function createIndex(tokenize: 'strict' | 'forward'): Document {
  if (tokenize === 'strict') {
    return new Document({
      encoder,
      tokenize: 'strict',
      cache: 100,
      document: {
        id: 'id',
        index: ['title', 'content'],
        store: ['title', 'category', 'source', 'snippet'],
      },
    })
  }
  return new Document({
    encoder,
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
    searchIndex = createIndex('forward')
  }
  if (!exactIndex) {
    exactIndex = createIndex('strict')
  }
  const truncatedContent = doc.contentText.slice(0, 8000)
  // Store a short excerpt for snippet generation instead of full content
  const storeSnippet = truncatedContent.length > STORE_SNIPPET_LENGTH
    ? truncatedContent.slice(0, STORE_SNIPPET_LENGTH) + '...'
    : truncatedContent
  const entry = {
    title: doc.title,
    content: truncatedContent,
    category: doc.category,
    source: doc.source,
    snippet: storeSnippet,
  }
  await Promise.all([
    searchIndex.add(doc.id, entry),
    exactIndex.add(doc.id, entry),
  ])
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

/** Internal candidate pool per index query — large enough that a flood of
 *  prefix matches ("220", "221", …) can't crowd an exact match out of the
 *  pool before tier ranking applies. Final results are still sliced to `limit`. */
const SEARCH_POOL = 150

interface SearchTier {
  index: Document | null
  field: string
  score: number
  /** Queries to run for this tier — usually just the original query */
  queries: string[]
}

export async function search(
  query: string,
  limit = 20
): Promise<SearchResult[]> {
  if ((!searchIndex && !exactIndex) || !query.trim()) return []

  try {
    const results = new Map<string, SearchResult>()
    // A doc keeps the score of the best tier it appears in.

    // Numeric queries ("#22", "220"): docs whose number STARTS WITH the query
    // ("220", "2200" for "22") are part of what the user is looking for, so
    // they get their own tiers between exact matches and generic matches.
    // Without this, generic docs that merely mention "22" (chapter refs, code,
    // …) flood the exact tier and push the whole "22x" family out of the cut.
    const core = query.trim().replace(/^#+/, '')
    const tiers: SearchTier[] = [
      { index: exactIndex, field: 'title', score: 100, queries: [query] },
      { index: exactIndex, field: 'content', score: 80, queries: [query] },
    ]
    if (/^\d+$/.test(core) && searchIndex) {
      tiers.push(
        { index: searchIndex, field: 'title', score: 90, queries: Array.from({ length: 10 }, (_, d) => core + d) },
        { index: searchIndex, field: 'content', score: 72, queries: Array.from({ length: 10 }, (_, d) => core + d) },
      )
    }
    tiers.push(
      { index: searchIndex, field: 'title', score: 50, queries: [query] },
      { index: searchIndex, field: 'content', score: 30, queries: [query] },
    )

    for (const tier of tiers) {
      if (!tier.index) continue
      for (const tierQuery of tier.queries) {
        const groups = await tier.index.search(tierQuery, {
          index: tier.field,
          limit: SEARCH_POOL,
          enrich: true,
        })
        if (!Array.isArray(groups) || groups.length === 0) continue
        for (const group of groups) {
          for (const result of group.result) {
            const id = String(result.id)
            if (results.has(id)) continue
            const doc = result.doc as Record<string, string | undefined> | undefined
            results.set(id, {
              id,
              title: doc?.title || id,
              category: doc?.category || '',
              source: doc?.source || '',
              score: tier.score,
              snippet: generateSnippet(doc?.snippet || '', query),
            })
          }
        }
      }
    }

    // Sort by tier score; stable sort keeps FlexSearch relevance order within a tier
    return Array.from(results.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
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
  exactIndex = null
}

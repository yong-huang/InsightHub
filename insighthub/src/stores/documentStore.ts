import { create } from 'zustand'
import type { Document, ImportedDocumentRecord, SearchFilters, Source, WorkspaceConfig } from '@/types'
import { fetchDocumentManifest, clearManifestCache } from '@/utils/documentManifest'
import { fetchAndParseDocument, parseHtmlDocument, stripTitleSuffix } from '@/utils/htmlParser'
import { storageService, type DocumentMeta, type ReadHistoryEntry } from '@/services/storageService'
import { indexDocument, clearIndex, setIsIndexing } from '@/services/searchService'
import { useTagStore } from '@/stores/tagStore'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { getDirectoryFromSource } from '@/utils/workspaceUtils'
import { fetchImportedDocs, importDocument, deleteImportedDocument, fetchImportedDocHtml } from '@/services/importService'
import { addSnippet, clearSimilarityCache } from '@/services/similarityService'

/** Build title suffixes to strip from workspace labels/subtitles */
function buildTitleSuffixes(workspaces: WorkspaceConfig[]): string[] {
  return workspaces.flatMap(ws => [
    ` - ${ws.label}`,
    ws.subtitle ? `| ${ws.subtitle} ${ws.label}` : null,
  ]).filter(Boolean) as string[]
}

interface DocumentState {
  documents: Map<string, Document>
  isLoading: boolean
  loadProgress: { current: number; total: number }
  filters: SearchFilters
  filteredDocuments: Document[]
  categoryCounts: Record<string, number>
  stats: { total: number; read: number; unread: number; categories: number }

  // Actions
  initializeDocuments: () => Promise<void>
  reloadDocuments: () => Promise<void>
  refreshReadMeta: () => void
  setFilters: (filters: Partial<SearchFilters>) => void
  resetFilters: () => void
  markAsRead: (docId: string, rating?: number) => void
  toggleRead: (docId: string) => void
  updateRating: (docId: string, rating: number) => void
  setDeprecated: (docId: string) => void
  restoreDocument: (docId: string) => void
  trashDocument: (docId: string) => void
  restoreTrashedDocument: (docId: string) => void
  emptyTrash: () => Promise<void>
  applyFilters: () => void
  getDocument: (docId: string) => Document | undefined
  getRecentReads: () => Document[]
  /** Fetch and cache contentText for a doc (freed after init to save memory) */
  ensureContentText: (docId: string) => Promise<Document | undefined>
  loadImportedDocuments: () => Promise<void>
  importDocument: (file: File, source: Source, category: string) => Promise<string>
  removeDocument: (docId: string) => Promise<void>
}

const DEFAULT_FILTERS: SearchFilters = { sortBy: 'title-asc' }

/** Migration rules: each entry maps an old prefix to a new prefix for specific categories.
 *  e.g. { from: 'ti', to: 'ai', re: /^ti-(ai-frameworks|...)-/ } means ti-foo-bar → ai-foo-bar */
interface MigrationRule {
  from: string
  to: string
  re: RegExp
}

/** One-time cleanup: rewrite localStorage entries for categories moved between workspaces.
 *  Exported so it can run synchronously before any store initialization. */
export function cleanupMigratedLocalData(): void {
  const PREFIX = 'insighthub:'

  const rules: MigrationRule[] = [
    // AI categories moved from TechInsight → AIInsight
    { from: 'ti', to: 'ai', re: /^ti-(ai-frameworks|dl-fundamentals|llm-comparisons|llm-fundamentals|rag-comparisons|mlops)-/ },
    // Vendor category moved from TechInsight → CompanyInsight
    { from: 'ti', to: 'ci', re: /^ti-vendor-/ },
    // Programming categories moved from TechInsight → ProgrammingInsight
    { from: 'ti', to: 'pli', re: /^ti-(cuda|go|python|rust|programming)-(cuda|go|python|rust)-/ },
    // English categories moved from MindInsight → EnglishInsight
    { from: 'mi', to: 'ei', re: /^mi-(english|business|chinglish|daily|exams|grammar|reading|speaking|vocabulary|writing|songs)-/ },
  ]

  /** Check if a docId matches any migration rule, and if so return the rewritten ID */
  function rewriteId(id: string): string {
    for (const rule of rules) {
      if (rule.re.test(id)) return id.replace(rule.from + '-', rule.to + '-')
    }
    return id
  }

  // 1. Read history — rewrite migrated entries, dedup
  try {
    const raw = localStorage.getItem(`${PREFIX}read-history`)
    if (raw) {
      const arr = JSON.parse(raw) as any[]
      const cleaned = arr.map((h: any) => {
        const newId = rewriteId(h.documentId)
        return newId !== h.documentId ? { ...h, documentId: newId } : h
      })
      const seen = new Map<string, any>()
      for (const e of cleaned) {
        const prev = seen.get(e.documentId)
        if (!prev || e.readAt > prev.readAt) seen.set(e.documentId, e)
      }
      const deduped = Array.from(seen.values()).sort((a, b) => b.readAt - a.readAt).slice(0, 365)
      localStorage.setItem(`${PREFIX}read-history`, JSON.stringify(deduped))
    }
  } catch { /* quota — try removing instead */ }

  // 2-10. Object/array stores — rewrite keys or filter entries
  const ARRAY_STORES: { key: string; idField: string }[] = [
    { key: `${PREFIX}annotations`, idField: 'documentId' },
    { key: `${PREFIX}concept-cards`, idField: 'sourceDocId' },
    { key: `${PREFIX}quiz-history`, idField: 'documentId' },
    { key: `${PREFIX}read-later`, idField: 'documentId' },
  ]
  const OBJECT_STORES: string[] = [
    `${PREFIX}quizzes`,
    `${PREFIX}document-meta`,
    `${PREFIX}chat-history`,
    `${PREFIX}summaries`,
    `${PREFIX}reading-positions`,
    `${PREFIX}ratings`,
  ]

  for (const { key, idField } of ARRAY_STORES) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const arr = JSON.parse(raw) as any[]
      const cleaned = arr.map(item => {
        const newId = rewriteId(item[idField])
        return newId !== item[idField] ? { ...item, [idField]: newId } : item
      })
      localStorage.setItem(key, JSON.stringify(cleaned))
    } catch { localStorage.removeItem(key) }
  }

  for (const key of OBJECT_STORES) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const obj = JSON.parse(raw) as Record<string, any>
      const cleaned: Record<string, any> = {}
      for (const [k, v] of Object.entries(obj)) {
        const newK = rewriteId(k)
        cleaned[newK] = v
      }
      localStorage.setItem(key, JSON.stringify(cleaned))
    } catch { localStorage.removeItem(key) }
  }
}

async function loadAllDocuments(
  get: () => DocumentState,
  set: (partial: Partial<DocumentState>) => void,
): Promise<void> {
  const manifest = await fetchDocumentManifest()
  set({ isLoading: true, loadProgress: { current: 0, total: manifest.length } })

  // Start server meta fetches in parallel with document loading
  const serverMetaPromise = fetch('/api/read-meta').then(r => r.json()).catch(() => ({}))
  const serverHistoryPromise = fetch('/api/read-history').then(r => r.json()).catch(() => [])

  const docs = new Map<string, Document>()
  const categoryCounts: Record<string, number> = {}
  const titleSuffixes = buildTitleSuffixes(usePreferenceStore.getState().workspaces)

  clearIndex()

  // Phase 1: build Document objects from enriched manifest (0 fetches)
  for (const entry of manifest) {
    const title = entry.title
      ? stripTitleSuffix(entry.title, titleSuffixes)
      : entry.fileName.replace(/\.html$/, '')

    const doc: Document = {
      id: entry.id,
      title,
      filePath: entry.filePath,
      fileName: entry.fileName,
      source: entry.source,
      category: entry.category,
      subcategory: entry.subcategory,
      language: entry.language || 'en',
      wordCount: entry.wordCount || 0,
      sections: entry.sections || [],
      contentText: entry.contentSnippet || '',
      tags: [],
      isRead: false,
      readCount: 0,
      indexedAt: Date.now(),
    }
    docs.set(doc.id, doc)
    categoryCounts[doc.category] = (categoryCounts[doc.category] || 0) + 1
  }

  // Merge server meta (arrived in parallel) — server takes priority
  const [serverMeta, serverHistory] = await Promise.all([serverMetaPromise, serverHistoryPromise])
  if (Object.keys(serverMeta).length > 0) {
    const metaMap = { ...storageService.getDocumentMeta(), ...serverMeta }
    storageService.setDocumentMeta(metaMap)
    for (const doc of docs.values()) {
      const meta: DocumentMeta | undefined = metaMap[doc.id]
      if (meta) {
        doc.isRead = meta.isRead
        doc.lastReadAt = meta.lastReadAt
        doc.readCount = meta.readCount
        if (meta.rating != null) doc.rating = meta.rating
      }
    }
  }

  // Merge ratings from localStorage
  const ratings = storageService.getRatings()
  for (const doc of docs.values()) {
    if (ratings[doc.id] != null) {
      doc.rating = ratings[doc.id]
    }
  }

  // Mark deprecated documents
  const deprecatedIds = new Set(storageService.getDeprecatedIds())
  const trashedIds = new Set(storageService.getTrashedIds())
  for (const doc of docs.values()) {
    if (deprecatedIds.has(doc.id)) doc.isDeprecated = true
    if (trashedIds.has(doc.id)) doc.isDeprecated = true
  }
  if (Array.isArray(serverHistory) && serverHistory.length > 0) {
    const localHistory = storageService.getReadHistory()
    const localMap = new Map(localHistory.map((h: any) => [h.documentId, h]))
    let changed = false
    for (const entry of serverHistory) {
      const local = localMap.get(entry.documentId)
      if (!local) {
        localMap.set(entry.documentId, entry)
        changed = true
      } else if (entry.readAt > local.readAt) {
        localMap.set(entry.documentId, entry)
        changed = true
      }
    }
    if (changed) {
      const merged = Array.from(localMap.values()).sort((a, b) => b.readAt - a.readAt).slice(0, 365)
      storageService._setReadHistory(merged)
    }
  }

  const docArray = Array.from(docs.values())
  const readCount = docArray.filter(d => d.isRead).length
  const categories = new Set(docArray.map(d => d.category))

  // Phase 1 complete — UI becomes interactive
  set({
    documents: docs,
    isLoading: false,
    categoryCounts,
    stats: {
      total: docArray.length,
      read: readCount,
      unread: docArray.length - readCount,
      categories: categories.size,
    },
  })

  get().applyFilters()

  // Load imported documents
  get().loadImportedDocuments()

  // Phase 2: index ALL docs in background (search becomes available progressively)
  setIsIndexing(true)
  indexAllDocs(Array.from(docs.values()))
}

async function indexAllDocs(
  allDocs: Document[],
): Promise<void> {
  const BATCH_SIZE = 50
  for (let i = 0; i < allDocs.length; i += BATCH_SIZE) {
    const batch = allDocs.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map(async (doc) => {
      try {
        if (!doc.contentText) return
        // Snapshot text for similarity before it gets freed
        addSnippet(doc.id, doc.contentText, doc.source, doc.category, doc.subcategory)
        await indexDocument(doc)
        doc.contentText = ''
      } catch (e) {
        console.error(`Failed to index document: ${doc.id}`, e)
      }
    }))
    await new Promise(r => setTimeout(r, 0))
  }
  setIsIndexing(false)
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: new Map(),
  isLoading: true,
  loadProgress: { current: 0, total: 0 },
  filters: { ...DEFAULT_FILTERS },
  filteredDocuments: [],
  categoryCounts: {},
  stats: { total: 0, read: 0, unread: 0, categories: 0 },

  initializeDocuments: async () => {
    // Skip if already loaded — startup guard
    if (get().documents.size > 0) return
    await loadAllDocuments(get, set)
  },

  reloadDocuments: async () => {
    // Force full reload — clear caches first
    clearManifestCache()
    clearSimilarityCache()
    set({ documents: new Map(), isLoading: true, filteredDocuments: [], categoryCounts: {}, stats: { total: 0, read: 0, unread: 0, categories: 0 } })
    clearIndex()
    await loadAllDocuments(get, set)
  },

  /** Lightweight: re-sync isRead/rating from localStorage without reloading documents */
  refreshReadMeta: () => {
    const { documents } = get()
    if (documents.size === 0) return
    const meta = storageService.getDocumentMeta()
    let changed = false
    const updated = new Map(documents)
    for (const doc of updated.values()) {
      const m = meta[doc.id]
      if (m) {
        if (!doc.isRead && m.isRead) {
          doc.isRead = true
          doc.readCount = m.readCount ?? doc.readCount
          doc.lastReadAt = m.lastReadAt ?? doc.lastReadAt
          changed = true
        }
        if (doc.rating !== m.rating && m.rating != null) {
          doc.rating = m.rating
          changed = true
        }
      }
    }
    if (changed) {
      set({ documents: updated })
      get().applyFilters()
    }
  },

  setFilters: (newFilters) => {
    set({ filters: { ...get().filters, ...newFilters } })
    get().applyFilters()
  },

  resetFilters: () => {
    set({ filters: { ...DEFAULT_FILTERS } })
    get().applyFilters()
  },

  markAsRead: (docId, rating) => {
    const { documents } = get()
    const doc = documents.get(docId)
    if (!doc || doc.isRead) return

    const updated = new Map(documents)
    updated.set(docId, {
      ...doc,
      isRead: true,
      readCount: doc.readCount + 1,
      lastReadAt: Date.now(),
      ...(rating != null ? { rating } : {}),
    })

    // Persist locally
    const metaMap = storageService.getDocumentMeta()
    metaMap[docId] = {
      id: docId,
      isRead: true,
      lastReadAt: Date.now(),
      readCount: doc.readCount + 1,
      ...(rating != null ? { rating } : {}),
    }
    storageService.setDocumentMeta(metaMap)

    // Persist rating separately
    if (rating != null) {
      storageService.saveRating(docId, rating)
    }

    // Add to read history locally
    storageService.addReadHistory({ documentId: docId, readAt: Date.now() })

    // Sync to server
    fetch('/api/read-meta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metaMap[docId]) }).catch(() => {})
    fetch('/api/read-history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId: docId, readAt: Date.now() }) }).catch(() => {})

    const { stats } = get()
    set({
      documents: updated,
      stats: { ...stats, read: stats.read + 1, unread: stats.unread - 1 },
    })

    get().applyFilters()
  },

  updateRating: (docId, rating) => {
    const { documents } = get()
    const doc = documents.get(docId)
    if (!doc || !doc.isRead) return

    const updated = new Map(documents)
    updated.set(docId, { ...doc, rating })

    const metaMap = storageService.getDocumentMeta()
    if (metaMap[docId]) {
      metaMap[docId] = { ...metaMap[docId], rating }
    } else {
      metaMap[docId] = { id: docId, isRead: true, lastReadAt: doc.lastReadAt, readCount: doc.readCount, rating }
    }
    storageService.setDocumentMeta(metaMap)
    storageService.saveRating(docId, rating)

    fetch('/api/read-meta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metaMap[docId]) }).catch(() => {})

    set({ documents: updated })
    get().applyFilters()
  },

  toggleRead: (docId) => {
    const { documents } = get()
    const doc = documents.get(docId)
    if (!doc) return

    if (doc.isRead) {
      // Mark as unread
      const updated = new Map(documents)
      updated.set(docId, {
        ...doc,
        isRead: false,
        readCount: 0,
        lastReadAt: undefined,
      })

      const metaMap = storageService.getDocumentMeta()
      delete metaMap[docId]
      storageService.setDocumentMeta(metaMap)

      // Remove from read history locally
      const history = storageService.getReadHistory()
      const filtered = history.filter(h => h.documentId !== docId)
      storageService._setReadHistory(filtered)

      // Sync deletion to server
      fetch(`/api/read-meta?id=${encodeURIComponent(docId)}`, { method: 'DELETE' }).catch(() => {})
      fetch(`/api/read-history?documentId=${encodeURIComponent(docId)}`, { method: 'DELETE' }).catch(() => {})

      const { stats } = get()
      set({
        documents: updated,
        stats: { ...stats, read: stats.read - 1, unread: stats.unread + 1 },
      })
    } else {
      get().markAsRead(docId)
      return
    }

    get().applyFilters()
  },

  setDeprecated: (docId) => {
    const { documents } = get()
    const doc = documents.get(docId)
    if (!doc) return

    const updated = new Map(documents)
    updated.set(docId, { ...doc, isDeprecated: true })
    storageService.setDeprecated(docId)
    set({ documents: updated })
    get().applyFilters()
  },

  restoreDocument: (docId) => {
    const { documents } = get()
    const doc = documents.get(docId)
    if (!doc) return

    const updated = new Map(documents)
    updated.set(docId, { ...doc, isDeprecated: false })
    storageService.restoreDeprecated(docId)
    set({ documents: updated })
    get().applyFilters()
  },

  trashDocument: (docId) => {
    const { documents } = get()
    const doc = documents.get(docId)
    if (!doc) return

    const updated = new Map(documents)
    updated.set(docId, { ...doc, isDeprecated: true })
    storageService.trashDocument(docId)
    set({ documents: updated })
    get().applyFilters()
  },

  restoreTrashedDocument: (docId) => {
    const { documents } = get()
    const doc = documents.get(docId)
    if (!doc) return

    const updated = new Map(documents)
    updated.set(docId, { ...doc, isDeprecated: false })
    storageService.restoreTrashed(docId)
    set({ documents: updated })
    get().applyFilters()
  },

  emptyTrash: async () => {
    const trashedDocs = storageService.getTrashedDocs()
    const { documents } = get()

    // Permanently delete each trashed doc
    for (const { docId } of trashedDocs) {
      const doc = documents.get(docId)
      if (!doc) continue

      if (docId.startsWith('imported-')) {
        try { await deleteImportedDocument(docId) } catch {}
      } else {
        try {
          await fetch(`/api/workspace-document?id=${encodeURIComponent(docId)}`, { method: 'DELETE' })
        } catch {}
      }
    }

    storageService.clearTrash()

    // Reload documents to reflect removals
    await get().reloadDocuments()
  },

  applyFilters: () => {
    const { documents, filters } = get()
    let result = Array.from(documents.values())

    // Filter out deprecated documents and categories from listings
    const deprecatedCategories = new Set(storageService.getDeprecatedCategories())
    const trashedIds = new Set(storageService.getTrashedIds())
    result = result.filter(d => !d.isDeprecated && !deprecatedCategories.has(`${d.source}:${d.category}`) && !trashedIds.has(d.id))

    if (filters.source) {
      result = result.filter(d => d.source === filters.source)
    }
    if (filters.category) {
      result = result.filter(d => d.category === filters.category)
    }
    if (filters.tag) {
      const tag = useTagStore.getState().tags.find(t => t.id === filters.tag)
      if (tag) {
        const docIds = new Set(tag.documentIds)
        result = result.filter(d => docIds.has(d.id))
      } else {
        result = []
      }
    }
    if (filters.isRead !== undefined && filters.isRead !== null) {
      result = result.filter(d => d.isRead === filters.isRead)
    }
    if (filters.rating !== undefined) {
      if (filters.rating === 0) {
        result = result.filter(d => !d.rating)
      } else {
        result = result.filter(d => (d.rating || 0) >= filters.rating!)
      }
    }

    // Sorting
    const sortBy = filters.sortBy || 'default'
    if (sortBy !== 'default') {
      result = [...result]
      switch (sortBy) {
        case 'title-asc':    result.sort((a, b) => a.title.localeCompare(b.title, 'zh')); break
        case 'title-desc':   result.sort((a, b) => b.title.localeCompare(a.title, 'zh')); break
        case 'lastRead-desc': result.sort((a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0)); break
        case 'readCount-desc': result.sort((a, b) => b.readCount - a.readCount); break
        case 'wordCount-desc': result.sort((a, b) => b.wordCount - a.wordCount); break
        case 'wordCount-asc':  result.sort((a, b) => a.wordCount - b.wordCount); break
      }
    }

    set({ filteredDocuments: result })
  },

  getDocument: (docId) => get().documents.get(docId),

  ensureContentText: async (docId) => {
    const doc = get().documents.get(docId)
    if (!doc) return undefined
    if (doc.contentText) return doc
    // Content was freed or never loaded — re-fetch and extract text
    try {
      let html: string
      if (doc.url) {
        // URL-based import: fetch via server proxy
        const res = await fetch('/api/fetch-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: doc.url }),
        })
        if (!res.ok) return doc
        const data = await res.json()
        html = data.html
      } else {
        // Regular workspace document
        const categoryPath = doc.subcategory ? `${doc.category}/${doc.subcategory}` : doc.category
        const url = import.meta.env.DEV
          ? `/dev-docs/${doc.source}/${categoryPath}/${doc.fileName}`
          : `/docs/${doc.source}/${categoryPath}/${doc.fileName}`
        const res = await fetch(url)
        if (!res.ok) return doc
        html = await res.text()
      }
      const text = new DOMParser().parseFromString(html, 'text/html').body?.textContent || ''
      const contentText = text.replace(/\s+/g, ' ').trim()
      // Trigger store update so React re-renders with new contentText
      const updated = new Map(get().documents)
      updated.set(docId, { ...doc, contentText })
      set({ documents: updated })
      return updated.get(docId)
    } catch {
      return doc
    }
  },

  getRecentReads: () => {
    const { documents } = get()
    const history = storageService.getReadHistory()
    const recent: Document[] = []
    for (const entry of history) {
      const doc = documents.get(entry.documentId)
      if (doc && recent.length < 10) {
        recent.push(doc)
      }
    }
    return recent
  },

  loadImportedDocuments: async () => {
    try {
      const importedMeta = await fetchImportedDocs()
      if (importedMeta.length === 0) return

      const { documents, categoryCounts, stats } = get()
      const updatedDocs = new Map(documents)
      const updatedCounts = { ...categoryCounts }
      let newCount = 0

      for (const meta of importedMeta) {
        if (updatedDocs.has(meta.id)) continue

        try {
          let doc: Document

          // URL-only import: build Document from metadata without fetching HTML
          if (meta.url) {
            // Ensure fileName ends with .html so buildTree recognizes it as a file (not a directory)
            const safeName = meta.fileName.endsWith('.html') ? meta.fileName : meta.fileName + '.html'
            // filePath must be a category-relative path for the file tree to display correctly
            const fakeFilePath = meta.category
              ? `${meta.category}/${safeName}`
              : safeName
            doc = {
              id: meta.id,
              title: meta.title || safeName.replace(/\.html?$/, ''),
              filePath: fakeFilePath,
              fileName: safeName,
              source: meta.source,
              category: meta.category,
              language: (meta.language as 'zh' | 'en' | 'mixed') || 'mixed',
              wordCount: meta.wordCount || 0,
              sections: [],
              contentText: '',
              tags: [],
              isRead: false,
              readCount: 0,
              indexedAt: meta.importedAt,
              url: meta.url,
            }
            updatedDocs.set(doc.id, doc)
            updatedCounts[doc.category] = (updatedCounts[doc.category] || 0) + 1
            // Index by title only (no contentText available until on-demand fetch)
            if (doc.title) {
              await indexDocument(doc)
            }
            newCount++
            continue
          }

          // Legacy import: try to fetch and parse. If fetch fails, fall back to cached metadata.
          let htmlContent: string
          try {
            htmlContent = await fetchImportedDocHtml(meta.id)
          } catch {
            // Fetch failed — use cached metadata as fallback stub
            if (meta.title || meta.wordCount) {
              doc = {
                id: meta.id,
                title: meta.title || meta.fileName.replace(/\.html?$/, ''),
                filePath: `imported://${meta.fileName}`,
                fileName: meta.fileName,
                source: meta.source,
                category: meta.category,
                language: (meta.language as 'zh' | 'en' | 'mixed') || 'mixed',
                wordCount: meta.wordCount || 0,
                sections: [],
                contentText: '',
                tags: [],
                isRead: false,
                readCount: 0,
                indexedAt: meta.importedAt,
              }
              updatedDocs.set(doc.id, doc)
              updatedCounts[doc.category] = (updatedCounts[doc.category] || 0) + 1
              newCount++
              continue
            }
            throw new Error('Fetch failed and no cached metadata')
          }

          const parsed = parseHtmlDocument(htmlContent, {
            id: meta.id,
            filePath: `imported://${meta.fileName}`,
            fileName: meta.fileName,
            source: meta.source,
            category: meta.category,
          }, buildTitleSuffixes(usePreferenceStore.getState().workspaces))
          doc = {
            ...parsed,
            isRead: false,
            readCount: 0,
            tags: [],
            indexedAt: Date.now(),
          }
          updatedDocs.set(doc.id, doc)
          updatedCounts[doc.category] = (updatedCounts[doc.category] || 0) + 1
          await indexDocument(doc)
          newCount++
        } catch {
          // Import failed (file not found, parse error, etc.) — skip silently
        }
      }

      if (newCount === 0) return

      const docArray = Array.from(updatedDocs.values())
      const readCount = docArray.filter(d => d.isRead).length
      const categories = new Set(docArray.map(d => d.category))

      set({
        documents: updatedDocs,
        categoryCounts: updatedCounts,
        stats: {
          total: docArray.length,
          read: readCount,
          unread: docArray.length - readCount,
          categories: categories.size,
        },
      })

      get().applyFilters()
    } catch (e) {
      console.error('Failed to load imported documents:', e)
    }
  },

  importDocument: async (file, source, category) => {
    // Parse HTML before uploading so the document metadata is available locally
    const htmlContent = await file.text()
    const parsed = parseHtmlDocument(htmlContent, {
      id: '', // will be set after upload
      filePath: `../${getDirectoryFromSource(source, usePreferenceStore.getState().workspaces)}/${category}/${file.name}`,
      fileName: file.name,
      source,
      category,
    }, buildTitleSuffixes(usePreferenceStore.getState().workspaces))

    const result = await importDocument(file.name, htmlContent, source, category, {
      title: parsed.title,
      wordCount: parsed.wordCount,
      language: parsed.language,
    })

    const doc: Document = {
      ...parsed,
      id: result.id,
      isRead: false,
      readCount: 0,
      tags: [],
      indexedAt: Date.now(),
    }

    const { documents, categoryCounts, stats } = get()
    const updatedDocs = new Map(documents)
    updatedDocs.set(doc.id, doc)
    const updatedCounts = { ...categoryCounts }
    updatedCounts[doc.category] = (updatedCounts[doc.category] || 0) + 1

    await indexDocument(doc)

    const docArray = Array.from(updatedDocs.values())
    const readCount = docArray.filter(d => d.isRead).length
    const categories = new Set(docArray.map(d => d.category))

    set({
      documents: updatedDocs,
      categoryCounts: updatedCounts,
      stats: {
        total: docArray.length,
        read: readCount,
        unread: docArray.length - readCount,
        categories: categories.size,
      },
    })

    get().applyFilters()
    return result.id
  },

  removeDocument: async (docId) => {
    if (!docId.startsWith('imported-')) return

    const { documents, categoryCounts, stats } = get()
    const doc = documents.get(docId)
    if (!doc) return

    const updatedDocs = new Map(documents)
    updatedDocs.delete(docId)
    const updatedCounts = { ...categoryCounts }
    updatedCounts[doc.category] = Math.max(0, (updatedCounts[doc.category] || 0) - 1)

    await deleteImportedDocument(docId)

    const docArray = Array.from(updatedDocs.values())
    const readCount = docArray.filter(d => d.isRead).length
    const categories = new Set(docArray.map(d => d.category))

    set({
      documents: updatedDocs,
      categoryCounts: updatedCounts,
      stats: {
        total: docArray.length,
        read: readCount,
        unread: docArray.length - readCount,
        categories: categories.size,
      },
    })

    get().applyFilters()
  },
}))

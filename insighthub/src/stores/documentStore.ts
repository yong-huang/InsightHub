import { create } from 'zustand'
import type { Document, SearchFilters } from '@/types'
import { fetchDocumentManifest } from '@/utils/documentManifest'
import { fetchAndParseDocument } from '@/utils/htmlParser'
import { storageService, type DocumentMeta, type ReadHistoryEntry } from '@/services/storageService'
import { indexDocument, clearIndex } from '@/services/searchService'

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
  setFilters: (filters: Partial<SearchFilters>) => void
  resetFilters: () => void
  markAsRead: (docId: string) => void
  applyFilters: () => void
  getDocument: (docId: string) => Document | undefined
  getRecentReads: () => Document[]
}

const DEFAULT_FILTERS: SearchFilters = {}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: new Map(),
  isLoading: true,
  loadProgress: { current: 0, total: 0 },
  filters: { ...DEFAULT_FILTERS },
  filteredDocuments: [],
  categoryCounts: {},
  stats: { total: 0, read: 0, unread: 0, categories: 0 },

  initializeDocuments: async () => {
    const manifest = await fetchDocumentManifest()
    set({ isLoading: true, loadProgress: { current: 0, total: manifest.length } })

    // Load cached meta
    const metaMap = storageService.getDocumentMeta()
    const docs = new Map<string, Document>()
    const categoryCounts: Record<string, number> = {}

    clearIndex()

    // Progressive indexing - batch fetch
    const BATCH_SIZE = 8
    for (let i = 0; i < manifest.length; i += BATCH_SIZE) {
      const batch = manifest.slice(i, i + BATCH_SIZE)
      const promises = batch.map(async (entry) => {
        try {
          const doc = await fetchAndParseDocument(entry)
          // Restore read state from cache
          const meta: DocumentMeta | undefined = metaMap[doc.id]
          if (meta) {
            doc.isRead = meta.isRead
            doc.lastReadAt = meta.lastReadAt
            doc.readCount = meta.readCount
          }
          docs.set(doc.id, doc)

          // Index for search
          await indexDocument(doc)

          // Count categories
          categoryCounts[doc.category] = (categoryCounts[doc.category] || 0) + 1
        } catch (e) {
          console.error(`Failed to load document: ${entry.filePath}`, e)
        }
      })
      await Promise.all(promises)
      set({ loadProgress: { current: i + batch.length, total: manifest.length } })
    }

    const docArray = Array.from(docs.values())
    const readCount = docArray.filter(d => d.isRead).length
    const categories = new Set(docArray.map(d => d.category))

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
  },

  setFilters: (newFilters) => {
    set({ filters: { ...get().filters, ...newFilters } })
    get().applyFilters()
  },

  resetFilters: () => {
    set({ filters: { ...DEFAULT_FILTERS } })
    get().applyFilters()
  },

  markAsRead: (docId) => {
    const { documents } = get()
    const doc = documents.get(docId)
    if (!doc || doc.isRead) return

    const updated = new Map(documents)
    updated.set(docId, {
      ...doc,
      isRead: true,
      readCount: doc.readCount + 1,
      lastReadAt: Date.now(),
    })

    // Persist
    const metaMap = storageService.getDocumentMeta()
    metaMap[docId] = {
      id: docId,
      isRead: true,
      lastReadAt: Date.now(),
      readCount: doc.readCount + 1,
    }
    storageService.setDocumentMeta(metaMap)

    // Add to read history
    storageService.addReadHistory({ documentId: docId, readAt: Date.now() })

    const docArray = Array.from(updated.values())
    const readCount = docArray.filter(d => d.isRead).length

    set({
      documents: updated,
      stats: { ...get().stats, read: readCount, unread: docArray.length - readCount },
    })

    get().applyFilters()
  },

  applyFilters: () => {
    const { documents, filters } = get()
    let result = Array.from(documents.values())

    if (filters.source) {
      result = result.filter(d => d.source === filters.source)
    }
    if (filters.category) {
      result = result.filter(d => d.category === filters.category)
    }
    if (filters.tag) {
      result = result.filter(d => d.tags?.includes(filters.tag!))
    }
    if (filters.isRead !== undefined && filters.isRead !== null) {
      result = result.filter(d => d.isRead === filters.isRead)
    }

    set({ filteredDocuments: result })
  },

  getDocument: (docId) => get().documents.get(docId),

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
}))

import { create } from 'zustand'
import type { Document, ImportedDocumentRecord, SearchFilters } from '@/types'
import { fetchDocumentManifest } from '@/utils/documentManifest'
import { fetchAndParseDocument, parseHtmlDocument } from '@/utils/htmlParser'
import { storageService, type DocumentMeta, type ReadHistoryEntry } from '@/services/storageService'
import { indexDocument, clearIndex } from '@/services/searchService'
import { useTagStore } from '@/stores/tagStore'
import { fetchImportedDocs, importDocument, deleteImportedDocument, fetchImportedDocHtml, fetchAndDecryptImportedDoc } from '@/services/importService'

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
  toggleRead: (docId: string) => void
  applyFilters: () => void
  getDocument: (docId: string) => Document | undefined
  getRecentReads: () => Document[]
  loadImportedDocuments: () => Promise<void>
  importDocument: (file: File, source: 'mindinsight' | 'techinsight', category: string) => Promise<string>
  removeDocument: (docId: string) => Promise<void>
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

    // Load cached meta from localStorage
    let metaMap = storageService.getDocumentMeta()

    // Merge server-side read meta (server takes priority)
    try {
      const serverMeta = await fetch('/api/read-meta').then(r => r.json())
      metaMap = { ...metaMap, ...serverMeta }
      storageService.setDocumentMeta(metaMap)
      // Also merge server read history
      const serverHistory: any[] = await fetch('/api/read-history').then(r => r.json())
      const localHistory = storageService.getReadHistory()
      const localIds = new Set(localHistory.map(h => h.documentId))
      const newEntries = serverHistory.filter(h => !localIds.has(h.documentId))
      if (newEntries.length > 0) {
        const merged = [...newEntries, ...localHistory].slice(0, 365)
        storageService._setReadHistory(merged)
      }
    } catch {}

    // Migrate read state for documents whose IDs changed due to directory reorganization.
    // When files move between directories, their generated IDs change but the fileName stays
    // the same. Detect orphaned meta entries (old IDs not in current manifest) and remap
    // them to new documents with matching fileName.
    const currentIds = new Set(manifest.map(e => e.id))
    let migrated = false
    for (const [oldId, meta] of Object.entries(metaMap)) {
      if (currentIds.has(oldId)) continue // Still valid, no migration needed
      // Find a current manifest entry with a matching fileName
      const match = manifest.find(e => !metaMap[e.id] && oldId.endsWith(e.fileName.replace(/\.html$/, '')))
      if (match) {
        metaMap[match.id] = { ...meta, id: match.id }
        delete metaMap[oldId]
        migrated = true
      }
    }
    if (migrated) storageService.setDocumentMeta(metaMap)

    // Also migrate read history entries with old documentIds
    if (migrated) {
      const history = storageService.getReadHistory()
      let historyChanged = false
      const migratedHistory = history.map(entry => {
        if (currentIds.has(entry.documentId)) return entry
        const match = manifest.find(e => entry.documentId.endsWith(e.fileName.replace(/\.html$/, '')))
        if (match) {
          historyChanged = true
          return { ...entry, documentId: match.id }
        }
        return entry
      })
      if (historyChanged) storageService._setReadHistory(migratedHistory)
    }

    const docs = new Map<string, Document>()
    const categoryCounts: Record<string, number> = {}

    clearIndex()

    // Progressive indexing - batch fetch
    const BATCH_SIZE = 20
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

    // Load imported documents
    get().loadImportedDocuments()
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

    // Persist locally
    const metaMap = storageService.getDocumentMeta()
    metaMap[docId] = {
      id: docId,
      isRead: true,
      lastReadAt: Date.now(),
      readCount: doc.readCount + 1,
    }
    storageService.setDocumentMeta(metaMap)

    // Add to read history locally
    storageService.addReadHistory({ documentId: docId, readAt: Date.now() })

    // Sync to server
    fetch('/api/read-meta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metaMap[docId]) }).catch(() => {})
    fetch('/api/read-history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId: docId, readAt: Date.now() }) }).catch(() => {})

    const docArray = Array.from(updated.values())
    const readCount = docArray.filter(d => d.isRead).length

    set({
      documents: updated,
      stats: { ...get().stats, read: readCount, unread: docArray.length - readCount },
    })

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

      const docArray = Array.from(updated.values())
      const readCount = docArray.filter(d => d.isRead).length

      set({
        documents: updated,
        stats: { ...get().stats, read: readCount, unread: docArray.length - readCount },
      })
    } else {
      get().markAsRead(docId)
      return
    }

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

          // Try to decrypt and parse. If decryption fails (key lost), fall back to cached metadata.
          let htmlContent: string
          try {
            htmlContent = await fetchAndDecryptImportedDoc(meta.id)
          } catch {
            // Decryption failed — use cached metadata as fallback stub
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
            throw new Error('Decryption failed and no cached metadata')
          }

          const parsed = parseHtmlDocument(htmlContent, {
            id: meta.id,
            filePath: `imported://${meta.fileName}`,
            fileName: meta.fileName,
            source: meta.source,
            category: meta.category,
          })
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
          // Import failed (file not found, decrypt/parse error, etc.) — skip silently
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
      filePath: `imported://${file.name}`,
      fileName: file.name,
      source,
      category,
    })

    const result = await importDocument(file.name, htmlContent, source, category, {
      title: parsed.title,
      wordCount: parsed.wordCount,
      language: parsed.language,
    })
    const doc: Document = {
      ...parsed,
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

import { create } from 'zustand'
import type { SearchResult } from '@/types'
import { search as flexSearch, parseSearchQuery, suggestTitles, applyFilters } from '@/services/searchService'
import { storageService } from '@/services/storageService'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDocumentStore } from '@/stores/documentStore'

interface SearchState {
  query: string
  results: SearchResult[]
  isSearching: boolean
  showDialog: boolean
  searchHistory: string[]
  suggestions: string[]
  selectedIndex: number

  setQuery: (q: string) => void
  performSearch: (q: string) => Promise<void>
  loadSuggestions: (q: string) => void
  setSelectedIndex: (i: number) => void
  loadHistory: () => void
  addToHistory: (q: string) => void
  clearHistory: () => void
  removeHistory: (q: string) => void
  openDialog: () => void
  closeDialog: () => void
  toggleDialog: () => void
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  results: [],
  isSearching: false,
  showDialog: false,
  searchHistory: [],
  suggestions: [],
  selectedIndex: -1,

  setQuery: (q) => set({ query: q, selectedIndex: -1 }),

  performSearch: async (q) => {
    if (!q.trim()) {
      set({ results: [], isSearching: false, query: q, suggestions: [] })
      return
    }
    set({ isSearching: true, query: q, selectedIndex: -1 })
    const { text, filters } = parseSearchQuery(q)

    // If query is only filters (no text), use all documents as base results
    const hasOnlyFilters = !text.trim() && (filters.category || filters.isRead !== undefined || filters.hasAnnotation || filters.rating !== undefined || filters.source)
    let allResults: SearchResult[]
    if (hasOnlyFilters) {
      const docs = useDocumentStore.getState().documents
      const workspace = usePreferenceStore.getState().activeWorkspace
      allResults = Array.from(docs.values())
        .filter(d => d.source === workspace)
        .map(d => ({ id: d.id, title: d.title, category: d.category, source: d.source, score: 1 }))
    } else {
      allResults = await flexSearch(text, 30)
    }
    // Workspace filter (existing behavior)
    let results = allResults
    const workspace = usePreferenceStore.getState().activeWorkspace
    results = results.filter(r => r.source === workspace)
    // Apply parsed filters
    if (filters.category) {
      results = results.filter(r => r.category === filters.category)
    }
    if (filters.isRead !== undefined) {
      // isRead info needs docMap — we skip this in the store, SearchDialog handles it
    }
    if (filters.source) {
      results = results.filter(r => r.source === filters.source)
    }
    set({ results, isSearching: false })
    if (results.length > 0) {
      get().addToHistory(q)
    }
  },

  loadSuggestions: async (q) => {
    if (!q.trim()) {
      set({ suggestions: [] })
      return
    }
    const { text } = parseSearchQuery(q)
    const titles = await suggestTitles(text, 5)
    set({ suggestions: titles })
  },

  setSelectedIndex: (i) => set({ selectedIndex: i }),

  loadHistory: () => {
    set({ searchHistory: storageService.getSearchHistory() })
  },

  addToHistory: (q) => {
    storageService.addSearchHistory(q)
    set({ searchHistory: storageService.getSearchHistory() })
  },

  clearHistory: () => {
    storageService.clearSearchHistory()
    set({ searchHistory: [] })
  },

  removeHistory: (q) => {
    storageService.removeSearchHistory(q)
    set({ searchHistory: storageService.getSearchHistory() })
  },

  openDialog: () => set({ showDialog: true }),

  closeDialog: () => set({ showDialog: false, query: '', results: [], suggestions: [], selectedIndex: -1 }),

  toggleDialog: () => {
    const { showDialog } = get()
    if (showDialog) {
      get().closeDialog()
    } else {
      set({ showDialog: true })
    }
  },
}))

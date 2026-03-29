import { create } from 'zustand'
import type { SearchResult } from '@/types'
import { search as flexSearch } from '@/services/searchService'
import { storageService } from '@/services/storageService'

interface SearchState {
  query: string
  results: SearchResult[]
  isSearching: boolean
  showDialog: boolean
  searchHistory: string[]

  setQuery: (q: string) => void
  performSearch: (q: string) => Promise<void>
  loadHistory: () => void
  addToHistory: (q: string) => void
  clearHistory: () => void
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

  setQuery: (q) => set({ query: q }),

  performSearch: async (q) => {
    if (!q.trim()) {
      set({ results: [], isSearching: false, query: q })
      return
    }
    set({ isSearching: true, query: q })
    const results = await flexSearch(q, 30)
    set({ results, isSearching: false })
    if (results.length > 0) {
      get().addToHistory(q)
    }
  },

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

  openDialog: () => set({ showDialog: true }),

  closeDialog: () => set({ showDialog: false, query: '', results: [] }),

  toggleDialog: () => {
    const { showDialog } = get()
    if (showDialog) {
      get().closeDialog()
    } else {
      set({ showDialog: true })
    }
  },
}))

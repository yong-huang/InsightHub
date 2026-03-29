const PREFIX = 'dochub:'

export const storageKeys = {
  PREFERENCES: `${PREFIX}preferences`,
  DOCUMENT_META: `${PREFIX}document-meta`,
  READ_HISTORY: `${PREFIX}read-history`,
  TAGS: `${PREFIX}tags`,
  QUIZ_HISTORY: `${PREFIX}quiz-history`,
  SEARCH_HISTORY: `${PREFIX}search-history`,
} as const

function getItem<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function setItem<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      console.warn('localStorage quota exceeded')
      return false
    }
    return false
  }
}

function removeItem(key: string): void {
  localStorage.removeItem(key)
}

export interface DocumentMeta {
  id: string
  isRead: boolean
  lastReadAt?: number
  readCount: number
}

export interface ReadHistoryEntry {
  documentId: string
  readAt: number
}

export const storageService = {
  getPreferences: () => getItem<{
    theme: 'light' | 'dark'
    quizDifficulty: 'easy' | 'medium' | 'hard'
    quizQuestionCount: number
    sidebarCollapsed: boolean
  }>(storageKeys.PREFERENCES, {
    theme: 'dark',
    quizDifficulty: 'medium',
    quizQuestionCount: 5,
    sidebarCollapsed: false,
  }),

  setPreferences: (prefs: Parameters<typeof storageService.getPreferences>[0]) =>
    setItem(storageKeys.PREFERENCES, prefs),

  getDocumentMeta: () => getItem<Record<string, DocumentMeta>>(storageKeys.DOCUMENT_META, {}),

  setDocumentMeta: (meta: Record<string, DocumentMeta>) =>
    setItem(storageKeys.DOCUMENT_META, meta),

  getReadHistory: () => getItem<ReadHistoryEntry[]>(storageKeys.READ_HISTORY, []),

  addReadHistory: (entry: ReadHistoryEntry) => {
    const history = storageService.getReadHistory()
    // Remove duplicate entries for the same document
    const filtered = history.filter(h => h.documentId !== entry.documentId)
    filtered.unshift(entry)
    // Keep only last 50 entries
    setItem(storageKeys.READ_HISTORY, filtered.slice(0, 50))
  },

  getTags: () => getItem<{
    id: string
    name: string
    color: string
    documentIds: string[]
  }[]>(storageKeys.TAGS, []),

  setTags: (tags: Parameters<typeof storageService.getTags>[0]) =>
    setItem(storageKeys.TAGS, tags),

  getQuizHistory: () => getItem<any[]>(storageKeys.QUIZ_HISTORY, []),

  addQuizAttempt: (attempt: any) => {
    const history = storageService.getQuizHistory()
    history.unshift(attempt)
    setItem(storageKeys.QUIZ_HISTORY, history.slice(0, 100))
  },

  getSearchHistory: () => getItem<string[]>(storageKeys.SEARCH_HISTORY, []),

  addSearchHistory: (query: string) => {
    const history = storageService.getSearchHistory()
    const filtered = history.filter(h => h !== query)
    filtered.unshift(query)
    setItem(storageKeys.SEARCH_HISTORY, filtered.slice(0, 20))
  },

  clearSearchHistory: () => removeItem(storageKeys.SEARCH_HISTORY),

  getStorageUsage: () => {
    let total = 0
    for (const key in localStorage) {
      if (localStorage.hasOwnProperty(key) && key.startsWith(PREFIX)) {
        total += (localStorage.getItem(key) || '').length * 2 // UTF-16
      }
    }
    return { used: total, max: 5 * 1024 * 1024, percentage: (total / (5 * 1024 * 1024)) * 100 }
  },
}

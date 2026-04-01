const PREFIX = 'insighthub:'

export const storageKeys = {
  PREFERENCES: `${PREFIX}preferences`,
  DOCUMENT_META: `${PREFIX}document-meta`,
  READ_HISTORY: `${PREFIX}read-history`,
  TAGS: `${PREFIX}tags`,
  QUIZ_HISTORY: `${PREFIX}quiz-history`,
  SEARCH_HISTORY: `${PREFIX}search-history`,
  QUIZZES: `${PREFIX}quizzes`,
  ANNOTATIONS: `${PREFIX}annotations`,
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
  getPreferences: () => {
    const stored = getItem<Record<string, any>>(storageKeys.PREFERENCES, {})
    return {
      theme: 'light',
      quizDifficulty: 'medium',
      quizQuestionCount: 5,
      sidebarCollapsed: false,
      aiApiUrl: 'http://127.0.0.1:7001/v1',
      aiModel: 'default',
      aiApiKey: '',
      activeWorkspace: 'mindinsight' as const,
      ...stored,
    }
  },

  setPreferences: (prefs: Parameters<typeof storageService.getPreferences>[0]) =>
    setItem(storageKeys.PREFERENCES, prefs),

  getDocumentMeta: () => getItem<Record<string, DocumentMeta>>(storageKeys.DOCUMENT_META, {}),

  setDocumentMeta: (meta: Record<string, DocumentMeta>) =>
    setItem(storageKeys.DOCUMENT_META, meta),

  getReadHistory: () => getItem<ReadHistoryEntry[]>(storageKeys.READ_HISTORY, []),

  _setReadHistory: (history: ReadHistoryEntry[]) =>
    setItem(storageKeys.READ_HISTORY, history),

  addReadHistory: (entry: ReadHistoryEntry) => {
    const history = storageService.getReadHistory()
    // Remove duplicate entries for the same document
    const filtered = history.filter(h => h.documentId !== entry.documentId)
    filtered.unshift(entry)
    // Keep only last 365 entries
    setItem(storageKeys.READ_HISTORY, filtered.slice(0, 365))
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

  setQuizHistory: (history: any[]) => setItem(storageKeys.QUIZ_HISTORY, history),

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

  removeSearchHistory: (query: string) => {
    const history = storageService.getSearchHistory()
    setItem(storageKeys.SEARCH_HISTORY, history.filter(h => h !== query))
  },

  getQuizzes: () => getItem<Record<string, any>>(storageKeys.QUIZZES, {}),

  saveQuiz: (quiz: any) => {
    const quizzes = storageService.getQuizzes()
    quizzes[quiz.documentId] = quiz
    return setItem(storageKeys.QUIZZES, quizzes)
  },

  removeQuiz: (documentId: string) => {
    const quizzes = storageService.getQuizzes()
    delete quizzes[documentId]
    setItem(storageKeys.QUIZZES, quizzes)
  },

  appendQuizQuestions: (documentId: string, newQuestions: any[]) => {
    const quizzes = storageService.getQuizzes()
    const existing = quizzes[documentId]
    if (!existing) return false
    const existingIds = new Set(existing.questions.map((q: any) => q.id))
    const unique = newQuestions.filter((q: any) => !existingIds.has(q.id))
    existing.questions.push(...unique)
    existing.maxScore = existing.questions.length * 100
    existing.createdAt = Date.now()
    return setItem(storageKeys.QUIZZES, quizzes)
  },

  getAnnotations: () => getItem<any[]>(storageKeys.ANNOTATIONS, []),

  setAnnotations: (annotations: any[]) => setItem(storageKeys.ANNOTATIONS, annotations),

}

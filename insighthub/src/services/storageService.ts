const PREFIX = 'insighthub:'

export const DEFAULT_WORKSPACES: import('@/types').WorkspaceConfig[] = [
  { id: 'mindinsight', label: 'MindInsight', icon: 'Brain', path: '../MindInsight', prefix: 'mi', shortLabel: 'Mind', subtitle: 'Mind & Insight', gradientClass: 'gradient-text-warm', color: '#ff8c42', colorBg: 'rgba(255, 140, 66, 0.15)' },
  { id: 'techinsight', label: 'TechInsight', icon: 'Cpu', path: '../TechInsight', prefix: 'ti', shortLabel: 'Tech', subtitle: 'Tech & Insight', gradientClass: 'gradient-text', color: '#326ce5', colorBg: 'rgba(50, 108, 229, 0.15)' },
  { id: 'leetcodeinsight', label: 'LeetcodeInsight', icon: 'Code2', path: '../LeetCodeInsight', prefix: 'li', shortLabel: 'LC', subtitle: 'Algorithm Mastery', gradientClass: 'gradient-text-green', color: '#4ecdc4', colorBg: 'rgba(78, 205, 196, 0.15)' },
]

export const storageKeys = {
  PREFERENCES: `${PREFIX}preferences`,
  DOCUMENT_META: `${PREFIX}document-meta`,
  READ_HISTORY: `${PREFIX}read-history`,
  TAGS: `${PREFIX}tags`,
  QUIZ_HISTORY: `${PREFIX}quiz-history`,
  SEARCH_HISTORY: `${PREFIX}search-history`,
  QUIZZES: `${PREFIX}quizzes`,
  ANNOTATIONS: `${PREFIX}annotations`,
  SUMMARIES: `${PREFIX}summaries`,
  READ_POSITIONS: `${PREFIX}reading-positions`,
  READ_LATER: `${PREFIX}read-later`,
  ACHIEVEMENTS: `${PREFIX}achievements`,
  FLASHCARDS: `${PREFIX}flashcards`,
  CHAT_HISTORY: `${PREFIX}chat-history`,
  CONCEPT_CARDS: `${PREFIX}concept-cards`,
  CHALLENGE_HISTORY: `${PREFIX}challenge-history`,
  CHALLENGE_SESSIONS: `${PREFIX}challenge-sessions`,
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
      activeWorkspace: DEFAULT_WORKSPACES[0]?.id || 'mindinsight',
      conceptMaxCount: 10,
      quizEnabledTypes: ['choice', 'truefalse', 'fill_blank', 'short_answer', 'code_completion'],
      workspaces: DEFAULT_WORKSPACES,
      ...stored,
    }
  },

  setPreferences: (prefs: Record<string, any>) =>
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
    const filtered = history.filter((h: ReadHistoryEntry) => h.documentId !== entry.documentId)
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

  setTags: (tags: { id: string; name: string; color: string; documentIds: string[] }[]) =>
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
    const filtered = history.filter((h: string) => h !== query)
    filtered.unshift(query)
    setItem(storageKeys.SEARCH_HISTORY, filtered.slice(0, 20))
  },

  clearSearchHistory: () => removeItem(storageKeys.SEARCH_HISTORY),

  removeSearchHistory: (query: string) => {
    const history = storageService.getSearchHistory()
    setItem(storageKeys.SEARCH_HISTORY, history.filter((h: string) => h !== query))
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

  getSummaries: () => getItem<Record<string, string>>(storageKeys.SUMMARIES, {}),

  saveSummary: (docId: string, text: string) => {
    const summaries = storageService.getSummaries()
    summaries[docId] = text
    return setItem(storageKeys.SUMMARIES, summaries)
  },

  // Reading positions
  getReadingPositions: () =>
    getItem<Record<string, { scrollTop: number; savedAt: number }>>(storageKeys.READ_POSITIONS, {}),

  saveReadingPosition: (docId: string, scrollTop: number) => {
    const positions = storageService.getReadingPositions()
    positions[docId] = { scrollTop, savedAt: Date.now() }
    setItem(storageKeys.READ_POSITIONS, positions)
  },

  // Read later list
  getReadLaterList: () =>
    getItem<{ documentId: string; addedAt: number }[]>(storageKeys.READ_LATER, []),

  addToReadLater: (documentId: string) => {
    const list = storageService.getReadLaterList()
    if (list.some(item => item.documentId === documentId)) return
    list.unshift({ documentId, addedAt: Date.now() })
    setItem(storageKeys.READ_LATER, list)
  },

  removeFromReadLater: (documentId: string) => {
    const list = storageService.getReadLaterList()
    setItem(storageKeys.READ_LATER, list.filter(item => item.documentId !== documentId))
  },

  isReadLater: (documentId: string) =>
    storageService.getReadLaterList().some(item => item.documentId === documentId),

  // Achievements
  getAchievementState: () =>
    getItem<{ unlockedIds: string[]; unlockedAt: Record<string, number> }>(storageKeys.ACHIEVEMENTS, {
      unlockedIds: [],
      unlockedAt: {},
    }),

  saveAchievementState: (state: { unlockedIds: string[]; unlockedAt: Record<string, number> }) =>
    setItem(storageKeys.ACHIEVEMENTS, state),

  // Flashcards
  getFlashcards: () => getItem<any[]>(storageKeys.FLASHCARDS, []),

  setFlashcards: (cards: any[]) => setItem(storageKeys.FLASHCARDS, cards),

  // Chat history per document
  getChatHistory: (docId: string) => {
    const all = getItem<Record<string, any[]>>(storageKeys.CHAT_HISTORY, {})
    return all[docId] || []
  },

  saveChatHistory: (docId: string, messages: any[]) => {
    const all = getItem<Record<string, any[]>>(storageKeys.CHAT_HISTORY, {})
    all[docId] = messages
    setItem(storageKeys.CHAT_HISTORY, all)
  },

  deleteChatHistory: (docId: string) => {
    const all = getItem<Record<string, any[]>>(storageKeys.CHAT_HISTORY, {})
    delete all[docId]
    setItem(storageKeys.CHAT_HISTORY, all)
  },

  // Concept cards
  getConceptCards: () => getItem<any[]>(storageKeys.CONCEPT_CARDS, []),

  setConceptCards: (cards: any[]) => setItem(storageKeys.CONCEPT_CARDS, cards),

  // Concept challenge history
  getChallengeHistory: () => getItem<any[]>(storageKeys.CHALLENGE_HISTORY, []),

  saveChallenge: (challenge: any) => {
    const history = storageService.getChallengeHistory()
    const idx = history.findIndex((c: any) => c.id === challenge.id)
    if (idx >= 0) {
      history[idx] = challenge
    } else {
      history.unshift(challenge)
    }
    setItem(storageKeys.CHALLENGE_HISTORY, history.slice(0, 50))
  },

  deleteChallenge: (challengeId: string) => {
    const history = storageService.getChallengeHistory()
    setItem(storageKeys.CHALLENGE_HISTORY, history.filter((c: any) => c.id !== challengeId))
  },

  // Migrate legacy data: if CHALLENGE_HISTORY was corrupted by session writes,
  // extract sessions to the new key and restore history as an empty array
  migrateChallengeStorage: () => {
    try {
      const raw = localStorage.getItem(storageKeys.CHALLENGE_HISTORY)
      if (!raw) return
      const data = JSON.parse(raw)
      if (Array.isArray(data)) return // already correct
      if (typeof data === 'object' && data !== null) {
        // Extract any __session_* keys to the new sessions key
        const sessionKeys = Object.keys(data).filter(k => k.startsWith('__session_'))
        if (sessionKeys.length > 0) {
          const sessions = getItem<Record<string, any>>(storageKeys.CHALLENGE_SESSIONS, {})
          for (const k of sessionKeys) sessions[k] = data[k]
          setItem(storageKeys.CHALLENGE_SESSIONS, sessions)
        }
        // Restore history as empty array
        setItem(storageKeys.CHALLENGE_HISTORY, [])
      }
    } catch { /* ignore parse errors */ }
  },

  // Active challenge session (per document) — survives panel toggle / page switch
  getChallengeSession: (docId: string) =>
    getItem<Record<string, any>>(storageKeys.CHALLENGE_SESSIONS, {})[`__session_${docId}`] ?? null,

  saveChallengeSession: (docId: string, session: any) => {
    const data = getItem<Record<string, any>>(storageKeys.CHALLENGE_SESSIONS, {})
    data[`__session_${docId}`] = session
    setItem(storageKeys.CHALLENGE_SESSIONS, data)
  },

  clearChallengeSession: (docId: string) => {
    const data = getItem<Record<string, any>>(storageKeys.CHALLENGE_SESSIONS, {})
    delete data[`__session_${docId}`]
    setItem(storageKeys.CHALLENGE_SESSIONS, data)
  },

}

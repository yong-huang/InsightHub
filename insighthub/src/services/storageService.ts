const PREFIX = 'insighthub:'

import type { WorkspaceConfig } from '@/types'
import type { StudyPlanResult } from '@/services/studyPlanService'

export const DEFAULT_WORKSPACES: WorkspaceConfig[] = []

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
  CHAT_HISTORY: `${PREFIX}chat-history`,
  CONCEPT_CARDS: `${PREFIX}concept-cards`,
  CHALLENGE_HISTORY: `${PREFIX}challenge-history`,
  CHALLENGE_SESSIONS: `${PREFIX}challenge-sessions`,
  TTS_PREFERENCES: `${PREFIX}tts-preferences`,
  INCEPTION: `${PREFIX}inception`,
  STUDY_PLANS: `${PREFIX}study-plans`,
  TOKEN_USAGE: `${PREFIX}token-usage`,
  DEPRECATED_IDS: `${PREFIX}deprecated-ids`,
  DEPRECATED_CATEGORIES: `${PREFIX}deprecated-categories`,
  CODE_EDITOR: `${PREFIX}code-editor`,
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

/** Keys that already have dedicated server-side sync endpoints — skip in generic sync */
const DEDICATED_SYNC_KEYS = new Set([
  `${PREFIX}preferences`,
  `${PREFIX}document-meta`,
  `${PREFIX}read-history`,
  `${PREFIX}annotations`,
  `${PREFIX}tags`,
  `${PREFIX}quiz-history`,
])

/** Keys that are safe to evict on quota overflow — all re-synced from server */
const EVICTABLE_KEYS: string[] = [
  `${PREFIX}chat-history`,
  `${PREFIX}inception`,
  `${PREFIX}summaries`,
  `${PREFIX}quizzes`,
  `${PREFIX}annotations`,
  `${PREFIX}concept-cards`,
  `${PREFIX}read-history`,
  `${PREFIX}document-meta`,
  `${PREFIX}reading-positions`,
  `${PREFIX}challenge-history`,
  `${PREFIX}challenge-sessions`,
]

function setItem<T>(key: string, value: T): boolean {
  try {
    const json = JSON.stringify(value)
    localStorage.setItem(key, json)
    if (key.startsWith(PREFIX) && !DEDICATED_SYNC_KEYS.has(key)) {
      fetch('/api/client-storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      }).catch(() => { /* ignore sync failures */ })
    }
    return true
  } catch (e) {
    // Quota exceeded — evict non-essential data and retry once
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      let freed = false
      for (const evictKey of EVICTABLE_KEYS) {
        try { localStorage.removeItem(evictKey); freed = true } catch {}
      }
      if (freed) {
        try {
          localStorage.setItem(key, json)
          return true
        } catch {}
      }
    }
    console.warn(`[storage] Failed to set ${key}:`, e)
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

/** Low-level raw string getter (bypasses JSON parse, used by similarity cache) */
function getRaw(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

export const storageService = {
  /** Fetch all client storage from server and merge into localStorage (server wins) */
  syncFromServer: async () => {
    try {
      const res = await fetch('/api/client-storage')
      if (!res.ok) return
      const serverData: Record<string, any> = await res.json()
      for (const [key, value] of Object.entries(serverData)) {
        if (key.startsWith(PREFIX) && !DEDICATED_SYNC_KEYS.has(key)) {
          localStorage.setItem(key, JSON.stringify(value))
        }
      }
    } catch {
      // Server unavailable — use localStorage only
    }
  },

  getPreferences: () => {
    const stored = getItem<Record<string, any>>(storageKeys.PREFERENCES, {})
    return {
      theme: 'light',
      quizDifficulty: 'medium',
      quizQuestionCount: 10,
      sidebarCollapsed: false,
      aiApiUrl: 'http://127.0.0.1:7001/v1',
      aiModel: 'default',
      aiApiKey: '',
      activeWorkspace: DEFAULT_WORKSPACES[0]?.id || '',
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
    setItem(storageKeys.QUIZ_HISTORY, history)
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

  /** Save entire quizzes object at once (avoids N individual writes) */
  saveQuizzesBulk: (quizzes: Record<string, any>) =>
    setItem(storageKeys.QUIZZES, quizzes),

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
    // Keep at most 100 summaries
    const keys = Object.keys(summaries)
    if (keys.length > 100) {
      for (const oldKey of keys.slice(0, keys.length - 100)) delete summaries[oldKey]
    }
    return setItem(storageKeys.SUMMARIES, summaries)
  },

  // Reading positions
  getReadingPositions: () =>
    getItem<Record<string, { scrollTop: number; scrollHeight: number; savedAt: number }>>(storageKeys.READ_POSITIONS, {}),

  saveReadingPosition: (docId: string, scrollTop: number, scrollHeight = 0) => {
    const positions = storageService.getReadingPositions()
    positions[docId] = { scrollTop, scrollHeight, savedAt: Date.now() }
    // Evict oldest entries beyond 500 to prevent localStorage bloat
    const keys = Object.keys(positions)
    if (keys.length > 500) {
      const sorted = keys.sort((a, b) => positions[a].savedAt - positions[b].savedAt)
      for (let i = 0; i < keys.length - 500; i++) delete positions[sorted[i]]
    }
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

  // Chat history per document
  getChatHistory: (docId: string) => {
    const all = getItem<Record<string, any[]>>(storageKeys.CHAT_HISTORY, {})
    return all[docId] || []
  },

  saveChatHistory: (docId: string, messages: any[]) => {
    const all = getItem<Record<string, any[]>>(storageKeys.CHAT_HISTORY, {})
    // Cap at 50 messages per document to prevent localStorage bloat
    all[docId] = messages.slice(-50)
    // Keep at most 30 documents' history
    const keys = Object.keys(all)
    if (keys.length > 30) {
      for (const oldKey of keys.slice(0, keys.length - 30)) delete all[oldKey]
    }
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

  // TTS preferences
  getTTSPreferences: () => getItem<{ rate: number; voiceURI: string }>(storageKeys.TTS_PREFERENCES, { rate: 1, voiceURI: '' }),

  saveTTSPreferences: (prefs: { rate: number; voiceURI: string }) =>
    setItem(storageKeys.TTS_PREFERENCES, prefs),

  // Inception (multi-level progressive summary)
  getInception: () => getItem<Record<string, string>>(storageKeys.INCEPTION, {}),

  saveInception: (docId: string, text: string) => {
    const data = storageService.getInception()
    data[docId] = text
    return setItem(storageKeys.INCEPTION, data)
  },

  // Study plans
  getStudyPlans: () => getItem<StudyPlanResult[]>(storageKeys.STUDY_PLANS, []),

  _setStudyPlans: (plans: StudyPlanResult[]) => setItem(storageKeys.STUDY_PLANS, plans),

  // Token usage tracking
  getTokenUsage: () => getItem<any[]>(storageKeys.TOKEN_USAGE, []),

  _setTokenUsage: (entries: any[]) => setItem(storageKeys.TOKEN_USAGE, entries),

  saveStudyPlan: (plan: StudyPlanResult) => {
    const plans = storageService.getStudyPlans()
    const idx = plans.findIndex((p: StudyPlanResult) => p.id === plan.id)
    if (idx >= 0) {
      plans[idx] = plan
    } else {
      plans.unshift(plan)
    }
    setItem(storageKeys.STUDY_PLANS, plans.slice(0, 10))
  },

  // Deprecated (hidden) document IDs
  getDeprecatedIds: () =>
    getItem<string[]>(storageKeys.DEPRECATED_IDS, []),

  setDeprecated: (docId: string) => {
    const ids = storageService.getDeprecatedIds()
    if (!ids.includes(docId)) {
      ids.push(docId)
      setItem(storageKeys.DEPRECATED_IDS, ids)
    }
  },

  restoreDeprecated: (docId: string) => {
    const ids = storageService.getDeprecatedIds().filter(id => id !== docId)
    setItem(storageKeys.DEPRECATED_IDS, ids)
  },

  // Deprecated (hidden) categories — stored as "source:category" strings
  getDeprecatedCategories: () =>
    getItem<string[]>(storageKeys.DEPRECATED_CATEGORIES, []),

  setDeprecatedCategory: (source: string, category: string) => {
    const key = `${source}:${category}`
    const list = storageService.getDeprecatedCategories()
    if (!list.includes(key)) {
      list.push(key)
      setItem(storageKeys.DEPRECATED_CATEGORIES, list)
    }
  },

  restoreDeprecatedCategory: (source: string, category: string) => {
    const key = `${source}:${category}`
    const list = storageService.getDeprecatedCategories().filter(k => k !== key)
    setItem(storageKeys.DEPRECATED_CATEGORIES, list)
  },

  /** Low-level raw string getter for similarity cache */
  _getRaw: getRaw,

}

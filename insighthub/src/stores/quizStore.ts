import { create } from 'zustand'
import type { Quiz, QuizAttempt, Difficulty, QuestionType } from '@/types'
import { createQuiz } from '@/services/quizService'

function syncQuizToServer(quiz: Quiz): Promise<void> {
  return fetch('/api/quizzes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(quiz),
  }).then(() => {}).catch(() => {})
}

function deleteQuizOnServer(docId: string): Promise<void> {
  return fetch('/api/quizzes', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentId: docId }),
  }).then(() => {}).catch(() => {})
}

function syncHistoryToServer(attempt: QuizAttempt): Promise<void> {
  return fetch('/api/quiz-history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(attempt),
  }).then(() => {}).catch(() => {})
}

interface QuizState {
  currentQuiz: Quiz | null
  currentAttempt: QuizAttempt | null
  isLoading: boolean
  isGrading: boolean
  error: string | null
  quizHistory: QuizAttempt[]
  savedQuizzes: Record<string, Quiz>
  generatingDocIds: Set<string>
  generatingErrors: Record<string, string>

  setCurrentQuiz: (quiz: Quiz | null) => void
  setCurrentAttempt: (attempt: QuizAttempt | null) => void
  setLoading: (loading: boolean) => void
  setGrading: (grading: boolean) => void
  setError: (error: string | null) => void
  loadHistory: () => void
  saveAttempt: (attempt: QuizAttempt) => void
  reset: () => void
  loadSavedQuizzes: () => void
  startGeneration: (docId: string, mode: 'new' | 'regenerate' | 'append', doc: { id: string; title: string; contentText: string }, difficulty: Difficulty, count: number, enabledTypes?: QuestionType[]) => Promise<void>
  clearGeneration: (docId: string) => void
  removeSavedQuiz: (docId: string) => void
}

export const useQuizStore = create<QuizState>((set, get) => ({
  currentQuiz: null,
  currentAttempt: null,
  isLoading: false,
  isGrading: false,
  error: null,
  quizHistory: [],
  savedQuizzes: {},
  generatingDocIds: new Set(),
  generatingErrors: {},

  setCurrentQuiz: (quiz) => set({ currentQuiz: quiz, error: null }),

  setCurrentAttempt: (attempt) => set({ currentAttempt: attempt }),

  setLoading: (isLoading) => set({ isLoading }),

  setGrading: (isGrading) => set({ isGrading }),

  setError: (error) => set({ error }),

  loadHistory: () => {
    fetch('/api/quiz-history')
      .then(r => r.json())
      .then((serverHistory: any[]) => {
        const seen = new Set<string>()
        const deduped: any[] = []
        for (const entry of serverHistory) {
          const key = entry.id || `${entry.documentId}-${entry.completedAt}`
          if (!seen.has(key)) { seen.add(key); deduped.push(entry) }
        }
        set({ quizHistory: deduped })
      })
      .catch(() => {})
  },

  saveAttempt: (attempt) => {
    const history = get().quizHistory
    if (attempt.id && history.some(e => e.id === attempt.id)) return
    set({ quizHistory: [attempt, ...history] })
    syncHistoryToServer(attempt)
  },

  reset: () => set({
    currentQuiz: null,
    currentAttempt: null,
    isLoading: false,
    isGrading: false,
    error: null,
  }),

  loadSavedQuizzes: () => {
    fetch('/api/quizzes')
      .then(r => r.json())
      .then((serverQuizzes: Record<string, any>) => {
        set({ savedQuizzes: serverQuizzes })
      })
      .catch(() => {})
  },

  startGeneration: async (docId, mode, doc, difficulty, count, enabledTypes) => {
    set(s => {
      const ids = new Set(s.generatingDocIds)
      ids.add(docId)
      const errors = { ...s.generatingErrors }
      delete errors[docId]
      return { generatingDocIds: ids, generatingErrors: errors }
    })
    try {
      const { quiz, error: err } = await createQuiz(
        doc as any,
        difficulty,
        count,
        enabledTypes,
      )
      if (err) {
        set(s => ({ generatingErrors: { ...s.generatingErrors, [docId]: err } }))
        return
      }

      if (mode === 'append') {
        const existing = get().savedQuizzes[docId]
        if (existing) {
          const baseOffset = existing.questions.length
          const renumbered = quiz.questions.map((q, i) => ({
            ...q,
            id: `q${baseOffset + i + 1}`,
          }))
          const merged: Quiz = {
            ...existing,
            questions: [...existing.questions, ...renumbered],
            maxScore: 100,
            createdAt: Date.now(),
          }
          set({ savedQuizzes: { ...get().savedQuizzes, [docId]: merged } })
          syncQuizToServer(merged)
        } else {
          set({ savedQuizzes: { ...get().savedQuizzes, [docId]: quiz } })
          syncQuizToServer(quiz)
        }
      } else {
        set({ savedQuizzes: { ...get().savedQuizzes, [docId]: quiz } })
        syncQuizToServer(quiz)
      }
    } catch (e: any) {
      set(s => ({ generatingErrors: { ...s.generatingErrors, [docId]: e.message || 'Generation failed' } }))
    } finally {
      set(s => {
        const ids = new Set(s.generatingDocIds)
        ids.delete(docId)
        return { generatingDocIds: ids }
      })
    }
  },

  clearGeneration: (docId) => set(s => {
    const errors = { ...s.generatingErrors }
    delete errors[docId]
    return { generatingErrors: errors }
  }),

  removeSavedQuiz: async (docId) => {
    set(s => {
      const updated = { ...s.savedQuizzes }
      delete updated[docId]
      return { savedQuizzes: updated }
    })
    await deleteQuizOnServer(docId)
  },
}))

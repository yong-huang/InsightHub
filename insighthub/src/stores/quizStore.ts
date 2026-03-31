import { create } from 'zustand'
import type { Quiz, QuizAttempt, Question, Difficulty } from '@/types'
import { storageService } from '@/services/storageService'
import { createQuiz } from '@/services/quizService'

interface QuizState {
  currentQuiz: Quiz | null
  currentAttempt: QuizAttempt | null
  isLoading: boolean
  isGrading: boolean
  error: string | null
  quizHistory: QuizAttempt[]
  savedQuizzes: Record<string, Quiz>
  generatingDocId: string | null
  generatingError: string | null

  setCurrentQuiz: (quiz: Quiz | null) => void
  setCurrentAttempt: (attempt: QuizAttempt | null) => void
  setLoading: (loading: boolean) => void
  setGrading: (grading: boolean) => void
  setError: (error: string | null) => void
  loadHistory: () => void
  saveAttempt: (attempt: QuizAttempt) => void
  reset: () => void
  loadSavedQuizzes: () => void
  startGeneration: (docId: string, mode: 'new' | 'regenerate' | 'append', doc: { id: string; title: string; contentText: string }, difficulty: Difficulty, count: number) => Promise<void>
  clearGeneration: () => void
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
  generatingDocId: null,
  generatingError: null,

  setCurrentQuiz: (quiz) => set({ currentQuiz: quiz, error: null }),

  setCurrentAttempt: (attempt) => set({ currentAttempt: attempt }),

  setLoading: (isLoading) => set({ isLoading }),

  setGrading: (isGrading) => set({ isGrading }),

  setError: (error) => set({ error }),

  loadHistory: () => {
    const localHistory = storageService.getQuizHistory()
    set({ quizHistory: localHistory })
    // Merge from server
    fetch('/api/quiz-history')
      .then(r => r.json())
      .then((serverHistory: any[]) => {
        // Deduplicate by id, server entries first
        const seen = new Set<string>()
        const merged: any[] = []
        for (const entry of serverHistory) {
          const key = entry.id || `${entry.documentId}-${entry.date}`
          if (!seen.has(key)) { seen.add(key); merged.push(entry) }
        }
        for (const entry of localHistory) {
          const key = entry.id || `${entry.documentId}-${entry.date}`
          if (!seen.has(key)) { seen.add(key); merged.push(entry) }
        }
        set({ quizHistory: merged.slice(0, 100) })
        storageService.setQuizHistory(merged.slice(0, 100))
      })
      .catch(() => {})
  },

  saveAttempt: (attempt) => {
    storageService.addQuizAttempt(attempt)
    const history = storageService.getQuizHistory()
    set({ quizHistory: history })
    // Sync to server
    fetch('/api/quiz-history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attempt) }).catch(() => {})
  },

  reset: () => set({
    currentQuiz: null,
    currentAttempt: null,
    isLoading: false,
    isGrading: false,
    error: null,
  }),

  loadSavedQuizzes: () => {
    const localQuizzes = storageService.getQuizzes()
    // Also load from server (server takes priority on conflicts)
    fetch('/api/quizzes')
      .then(r => r.json())
      .then((serverQuizzes: Record<string, any>) => {
        // Merge: server data overwrites local, but keep local-only quizzes
        const merged = { ...localQuizzes, ...serverQuizzes }
        set({ savedQuizzes: merged })
        // Sync merged data back to localStorage
        for (const [docId, quiz] of Object.entries(merged)) {
          storageService.saveQuiz(quiz)
        }
      })
      .catch(() => {
        // Server unavailable, use local data
        set({ savedQuizzes: localQuizzes })
      })
    // Immediately set local data for fast initial render
    set({ savedQuizzes: localQuizzes })
  },

  startGeneration: async (docId, mode, doc, difficulty, count) => {
    set({ generatingDocId: docId, generatingError: null })
    try {
      const { quiz, error: err } = await createQuiz(
        doc as any,
        difficulty,
        count,
      )
      if (err) {
        set({ generatingError: err })
        return
      }

      if (mode === 'append') {
        const existing = get().savedQuizzes[docId]
        if (existing) {
          // Re-assign IDs to avoid collisions with existing questions
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
          storageService.saveQuiz(merged)
          set(s => ({ savedQuizzes: { ...s.savedQuizzes, [docId]: merged } }))
          // Sync to server
          fetch('/api/quizzes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(merged) }).catch(() => {})
        } else {
          storageService.saveQuiz(quiz)
          set(s => ({ savedQuizzes: { ...s.savedQuizzes, [docId]: quiz } }))
          fetch('/api/quizzes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(quiz) }).catch(() => {})
        }
      } else {
        storageService.saveQuiz(quiz)
        set(s => ({ savedQuizzes: { ...s.savedQuizzes, [docId]: quiz } }))
        fetch('/api/quizzes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(quiz) }).catch(() => {})
      }
    } catch (e: any) {
      set({ generatingError: e.message || '生成失败' })
    } finally {
      set({ generatingDocId: null })
    }
  },

  clearGeneration: () => set({ generatingError: null }),

  removeSavedQuiz: (docId) => {
    storageService.removeQuiz(docId)
    set(s => {
      const updated = { ...s.savedQuizzes }
      delete updated[docId]
      return { savedQuizzes: updated }
    })
    // Sync deletion to server
    fetch('/api/quizzes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: docId }),
    }).catch(() => {})
  },
}))

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
    const history = storageService.getQuizHistory()
    set({ quizHistory: history })
  },

  saveAttempt: (attempt) => {
    storageService.addQuizAttempt(attempt)
    const history = storageService.getQuizHistory()
    set({ quizHistory: history })
  },

  reset: () => set({
    currentQuiz: null,
    currentAttempt: null,
    isLoading: false,
    isGrading: false,
    error: null,
  }),

  loadSavedQuizzes: () => {
    const quizzes = storageService.getQuizzes()
    set({ savedQuizzes: quizzes })
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
        } else {
          storageService.saveQuiz(quiz)
          set(s => ({ savedQuizzes: { ...s.savedQuizzes, [docId]: quiz } }))
        }
      } else {
        storageService.saveQuiz(quiz)
        set(s => ({ savedQuizzes: { ...s.savedQuizzes, [docId]: quiz } }))
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
  },
}))

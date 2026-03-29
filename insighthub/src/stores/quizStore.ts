import { create } from 'zustand'
import type { Quiz, QuizAttempt, Question } from '@/types'
import { storageService } from '@/services/storageService'

interface QuizState {
  currentQuiz: Quiz | null
  currentAttempt: QuizAttempt | null
  isLoading: boolean
  isGrading: boolean
  error: string | null
  quizHistory: QuizAttempt[]

  setCurrentQuiz: (quiz: Quiz | null) => void
  setCurrentAttempt: (attempt: QuizAttempt | null) => void
  setLoading: (loading: boolean) => void
  setGrading: (grading: boolean) => void
  setError: (error: string | null) => void
  loadHistory: () => void
  saveAttempt: (attempt: QuizAttempt) => void
  reset: () => void
}

export const useQuizStore = create<QuizState>((set) => ({
  currentQuiz: null,
  currentAttempt: null,
  isLoading: false,
  isGrading: false,
  error: null,
  quizHistory: [],

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
}))

import { create } from 'zustand'
import { storageService } from '@/services/storageService'
import type { UserPreferences, Difficulty } from '@/types'

interface PreferenceState extends UserPreferences {
  setTheme: (theme: 'light' | 'dark') => void
  toggleTheme: () => void
  setQuizDifficulty: (d: Difficulty) => void
  setQuizQuestionCount: (n: number) => void
  setSidebarCollapsed: (c: boolean) => void
  toggleSidebar: () => void
}

export const usePreferenceStore = create<PreferenceState>((set, get) => ({
  theme: storageService.getPreferences().theme,
  quizDifficulty: storageService.getPreferences().quizDifficulty,
  quizQuestionCount: storageService.getPreferences().quizQuestionCount,
  sidebarCollapsed: storageService.getPreferences().sidebarCollapsed,

  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme)
    const prefs = storageService.getPreferences()
    storageService.setPreferences({ ...prefs, theme })
    set({ theme })
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    get().setTheme(next)
  },

  setQuizDifficulty: (quizDifficulty) => {
    const prefs = storageService.getPreferences()
    storageService.setPreferences({ ...prefs, quizDifficulty })
    set({ quizDifficulty })
  },

  setQuizQuestionCount: (quizQuestionCount) => {
    const prefs = storageService.getPreferences()
    storageService.setPreferences({ ...prefs, quizQuestionCount })
    set({ quizQuestionCount })
  },

  setSidebarCollapsed: (sidebarCollapsed) => {
    const prefs = storageService.getPreferences()
    storageService.setPreferences({ ...prefs, sidebarCollapsed })
    set({ sidebarCollapsed })
  },

  toggleSidebar: () => {
    get().setSidebarCollapsed(!get().sidebarCollapsed)
  },
}))

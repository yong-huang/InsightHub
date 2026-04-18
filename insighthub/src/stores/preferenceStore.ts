import { create } from 'zustand'
import { storageService } from '@/services/storageService'
import type { UserPreferences, Difficulty, Source } from '@/types'

interface PreferenceState extends UserPreferences {
  setTheme: (theme: 'light' | 'dark') => void
  toggleTheme: () => void
  setQuizDifficulty: (d: Difficulty) => void
  setQuizQuestionCount: (n: number) => void
  setConceptMaxCount: (n: number) => void
  setSidebarCollapsed: (c: boolean) => void
  toggleSidebar: () => void
  setAiApiUrl: (url: string) => void
  setAiModel: (model: string) => void
  setAiApiKey: (key: string) => void
  setWorkspace: (ws: Source) => void
  loadQuizSettingsFromServer: () => Promise<void>
}

export const usePreferenceStore = create<PreferenceState>((set, get) => ({
  theme: storageService.getPreferences().theme,
  quizDifficulty: storageService.getPreferences().quizDifficulty,
  quizQuestionCount: storageService.getPreferences().quizQuestionCount,
  sidebarCollapsed: storageService.getPreferences().sidebarCollapsed,
  aiApiUrl: storageService.getPreferences().aiApiUrl,
  aiModel: storageService.getPreferences().aiModel,
  aiApiKey: storageService.getPreferences().aiApiKey,
  activeWorkspace: storageService.getPreferences().activeWorkspace,
  conceptMaxCount: storageService.getPreferences().conceptMaxCount,

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

  setConceptMaxCount: (conceptMaxCount) => {
    const prefs = storageService.getPreferences()
    storageService.setPreferences({ ...prefs, conceptMaxCount })
    set({ conceptMaxCount })
  },

  setSidebarCollapsed: (sidebarCollapsed) => {
    const prefs = storageService.getPreferences()
    storageService.setPreferences({ ...prefs, sidebarCollapsed })
    set({ sidebarCollapsed })
  },

  toggleSidebar: () => {
    get().setSidebarCollapsed(!get().sidebarCollapsed)
  },

  setAiApiUrl: (aiApiUrl) => {
    const prefs = storageService.getPreferences()
    storageService.setPreferences({ ...prefs, aiApiUrl })
    set({ aiApiUrl })
  },

  setAiModel: (aiModel) => {
    const prefs = storageService.getPreferences()
    storageService.setPreferences({ ...prefs, aiModel })
    set({ aiModel })
  },

  setAiApiKey: (aiApiKey) => {
    const prefs = storageService.getPreferences()
    storageService.setPreferences({ ...prefs, aiApiKey })
    set({ aiApiKey })
  },

  setWorkspace: (activeWorkspace) => {
    const prefs = storageService.getPreferences()
    storageService.setPreferences({ ...prefs, activeWorkspace })
    set({ activeWorkspace })
  },

  loadQuizSettingsFromServer: async () => {
    try {
      const res = await fetch('/api/ai/config')
      const cfg = await res.json()
      if (cfg.quizDifficulty) {
        const prefs = storageService.getPreferences()
        storageService.setPreferences({ ...prefs, quizDifficulty: cfg.quizDifficulty })
        set({ quizDifficulty: cfg.quizDifficulty })
      }
      if (cfg.quizQuestionCount) {
        const prefs = storageService.getPreferences()
        storageService.setPreferences({ ...prefs, quizQuestionCount: cfg.quizQuestionCount })
        set({ quizQuestionCount: cfg.quizQuestionCount })
      }
    } catch {}
  },
}))

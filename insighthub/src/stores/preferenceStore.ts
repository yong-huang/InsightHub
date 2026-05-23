import { create } from 'zustand'
import { storageService } from '@/services/storageService'
import type { UserPreferences, Difficulty, Source, WorkspaceConfig, QuestionType } from '@/types'

export type FeatureKey = 'aiSummary' | 'aiInception' | 'aiEvaluation' | 'aiSpeech' | 'aiScript' | 'aiQuiz' | 'aiConcept' | 'aiSimilarity'

const ALL_FEATURES: FeatureKey[] = ['aiSummary', 'aiInception', 'aiEvaluation', 'aiSpeech', 'aiScript', 'aiQuiz', 'aiConcept', 'aiSimilarity']

interface PreferenceState extends UserPreferences {
  workspaces: WorkspaceConfig[]
  enabledFeatures: Record<FeatureKey, boolean>
  setTheme: (theme: 'light' | 'dark') => void
  toggleTheme: () => void
  setQuizDifficulty: (d: Difficulty) => void
  setQuizQuestionCount: (n: number) => void
  setQuizEnabledTypes: (t: QuestionType[]) => void
  setConceptMaxCount: (n: number) => void
  setSidebarCollapsed: (c: boolean) => void
  toggleSidebar: () => void
  setAiApiUrl: (url: string) => void
  setAiModel: (model: string) => void
  setAiApiKey: (key: string) => void
  setWorkspace: (ws: Source) => void
  addWorkspace: (ws: WorkspaceConfig) => void
  updateWorkspace: (ws: WorkspaceConfig) => void
  removeWorkspace: (id: string) => void
  setEnabledFeatures: (f: Record<FeatureKey, boolean>) => void
  loadQuizSettingsFromServer: () => Promise<void>
  loadWorkspacesFromServer: () => Promise<void>
}

function savePrefs(partial: Record<string, any>) {
  const prefs = storageService.getPreferences()
  storageService.setPreferences({ ...prefs, ...partial })
}

export const usePreferenceStore = create<PreferenceState>((set, get) => ({
  theme: (storageService.getPreferences().theme as 'light' | 'dark') || 'light',
  quizDifficulty: (storageService.getPreferences().quizDifficulty as Difficulty) || 'medium',
  quizQuestionCount: storageService.getPreferences().quizQuestionCount,
  sidebarCollapsed: storageService.getPreferences().sidebarCollapsed,
  aiApiUrl: storageService.getPreferences().aiApiUrl,
  aiModel: storageService.getPreferences().aiModel,
  aiApiKey: storageService.getPreferences().aiApiKey,
  activeWorkspace: storageService.getPreferences().activeWorkspace,
  conceptMaxCount: storageService.getPreferences().conceptMaxCount,
  quizEnabledTypes: (storageService.getPreferences().quizEnabledTypes || ['choice', 'truefalse', 'fill_blank', 'short_answer', 'code_completion']) as QuestionType[],
  workspaces: storageService.getPreferences().workspaces,
  enabledFeatures: (() => {
    const raw = storageService.getPreferences() as Record<string, any>
    const stored = raw.enabledFeatures as Record<FeatureKey, boolean> | undefined
    const defaults: Partial<Record<FeatureKey, boolean>> = { aiSummary: false, aiEvaluation: false, aiSpeech: false, aiScript: false }
    if (!stored) return Object.fromEntries(ALL_FEATURES.map(k => [k, defaults[k] ?? true])) as Record<FeatureKey, boolean>
    return Object.fromEntries(ALL_FEATURES.map(k => [k, stored[k] ?? defaults[k] ?? true])) as Record<FeatureKey, boolean>
  })(),

  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme)
    savePrefs({ theme })
    set({ theme })
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    get().setTheme(next)
  },

  setQuizDifficulty: (quizDifficulty) => {
    savePrefs({ quizDifficulty })
    set({ quizDifficulty })
  },

  setQuizQuestionCount: (quizQuestionCount) => {
    savePrefs({ quizQuestionCount })
    set({ quizQuestionCount })
  },

  setConceptMaxCount: (conceptMaxCount) => {
    savePrefs({ conceptMaxCount })
    set({ conceptMaxCount })
  },

  setQuizEnabledTypes: (quizEnabledTypes) => {
    savePrefs({ quizEnabledTypes })
    set({ quizEnabledTypes })
  },

  setSidebarCollapsed: (sidebarCollapsed) => {
    savePrefs({ sidebarCollapsed })
    set({ sidebarCollapsed })
  },

  toggleSidebar: () => {
    get().setSidebarCollapsed(!get().sidebarCollapsed)
  },

  setAiApiUrl: (aiApiUrl) => {
    savePrefs({ aiApiUrl })
    set({ aiApiUrl })
  },

  setAiModel: (aiModel) => {
    savePrefs({ aiModel })
    set({ aiModel })
  },

  setAiApiKey: (aiApiKey) => {
    savePrefs({ aiApiKey })
    set({ aiApiKey })
  },

  setWorkspace: (activeWorkspace) => {
    savePrefs({ activeWorkspace })
    set({ activeWorkspace })
  },

  addWorkspace: (ws) => {
    const workspaces = [...get().workspaces, ws]
    savePrefs({ workspaces })
    set({ workspaces })
  },

  updateWorkspace: (ws) => {
    const workspaces = get().workspaces.map(w => w.id === ws.id ? ws : w)
    savePrefs({ workspaces })
    set({ workspaces })
  },

  removeWorkspace: (id) => {
    const workspaces = get().workspaces.filter(w => w.id !== id)
    savePrefs({ workspaces })
    set({ workspaces })
  },

  setEnabledFeatures: (enabledFeatures) => {
    savePrefs({ enabledFeatures })
    set({ enabledFeatures })
  },

  loadQuizSettingsFromServer: async () => {
    try {
      const res = await fetch('/api/ai/config')
      const cfg = await res.json()
      if (cfg.quizDifficulty) {
        savePrefs({ quizDifficulty: cfg.quizDifficulty })
        set({ quizDifficulty: cfg.quizDifficulty })
      }
      if (cfg.quizQuestionCount) {
        savePrefs({ quizQuestionCount: cfg.quizQuestionCount })
        set({ quizQuestionCount: cfg.quizQuestionCount })
      }
    } catch {}
  },

  /** Load workspaces from server and merge into local state (server wins) */
  loadWorkspacesFromServer: async () => {
    try {
      const res = await fetch('/api/workspaces')
      if (!res.ok) return
      const serverWorkspaces: WorkspaceConfig[] = await res.json()
      if (!Array.isArray(serverWorkspaces) || serverWorkspaces.length === 0) return

      const localWorkspaces = get().workspaces
      const localIds = new Set(localWorkspaces.map(w => w.id))
      const serverIds = new Set(serverWorkspaces.map(w => w.id))

      // Only merge if server has workspaces not in local
      const hasNew = serverWorkspaces.some(w => !localIds.has(w.id))
      if (!hasNew) return

      // Merge: local workspace data for existing IDs takes precedence (has shortLabel/subtitle),
      // but add any server-only workspaces
      const merged = [...localWorkspaces]
      for (const sw of serverWorkspaces) {
        if (!localIds.has(sw.id)) {
          merged.push(sw)
        }
      }

      savePrefs({ workspaces: merged })
      set({ workspaces: merged })

      // Auto-select first workspace if none is active
      const currentActive = get().activeWorkspace
      if (!currentActive || !merged.some(w => w.id === currentActive)) {
        const firstId = merged[0]?.id || ''
        savePrefs({ activeWorkspace: firstId })
        set({ activeWorkspace: firstId })
      }
    } catch {
      // Server unavailable — keep local workspaces
    }
  },
}))

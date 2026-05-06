import { create } from 'zustand'
import { storageService } from '@/services/storageService'
import type { UserPreferences, Difficulty, Source, WorkspaceConfig, QuestionType } from '@/types'

interface PreferenceState extends UserPreferences {
  workspaces: WorkspaceConfig[]
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
    } catch {
      // Server unavailable — keep local workspaces
    }
  },
}))

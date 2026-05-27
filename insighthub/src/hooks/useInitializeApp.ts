import { useEffect, useRef } from 'react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDocumentStore, cleanupMigratedLocalData } from '@/stores/documentStore'
import { useTagStore } from '@/stores/tagStore'
import { useSearchStore } from '@/stores/searchStore'
import { useQuizStore } from '@/stores/quizStore'
import { useAnnotationStore } from '@/stores/annotationStore'
import { useConceptCardStore } from '@/stores/conceptCardStore'
import { storageService } from '@/services/storageService'
import { extendCategoryMap } from '@/services/searchService'
import { registerDynamicCategories, getCategoryInfo } from '@/utils/categoryMap'

export function useInitializeApp() {
  const initialized = useRef(false)

  const theme = usePreferenceStore(s => s.theme)

  // Apply theme reactively
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Initialize all data — run once only
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    // Migrate legacy challenge storage (one-time)
    storageService.migrateChallengeStorage()

    // Clean up stale ti- entries for categories moved to AIInsight (must run before any store writes)
    cleanupMigratedLocalData()

    // Start document loading immediately — don't block on server sync
    const initDocs = useDocumentStore.getState().initializeDocuments()

    // Parallel: load all lightweight stores from localStorage
    // These don't depend on each other or on documents
    Promise.all([
      useTagStore.getState().loadTags(),
      useSearchStore.getState().loadHistory(),
      useQuizStore.getState().loadHistory(),
      useQuizStore.getState().loadSavedQuizzes(),
      usePreferenceStore.getState().loadQuizSettingsFromServer(),
      useAnnotationStore.getState().loadAnnotations(),
      useConceptCardStore.getState().loadCards(),
    ])

    // Sync from server in parallel — results applied when ready, no blocking
    storageService.syncFromServer().then(() => {
      usePreferenceStore.getState().loadWorkspacesFromServer()
    })

    // After documents load, register dynamic categories globally
    initDocs.then(() => {
      const docs = useDocumentStore.getState().documents
      const seen = new Set<string>()
      const catEntries: { key: string; source: string }[] = []
      for (const doc of docs.values()) {
        if (doc.category && !seen.has(doc.category)) {
          seen.add(doc.category)
          catEntries.push({ key: doc.category, source: doc.source })
        }
      }
      registerDynamicCategories(catEntries)

      // Also extend search service's label→key map
      extendCategoryMap(catEntries.map(e => ({
        key: e.key,
        label: getCategoryInfo(e.key).label,
      })))
    })
  }, [])
}

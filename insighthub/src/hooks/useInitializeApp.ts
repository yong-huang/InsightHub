import { useEffect, useRef } from 'react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDocumentStore } from '@/stores/documentStore'
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

    // Sync localStorage from server first so all stores read the latest data
    storageService.syncFromServer().then(() => {
      // Restore workspaces from server (handles localStorage loss)
      usePreferenceStore.getState().loadWorkspacesFromServer()
      // Migrate legacy challenge storage (one-time)
      storageService.migrateChallengeStorage()

      // Start document loading (fetch + parse, non-blocking)
      const initDocs = useDocumentStore.getState().initializeDocuments()

      // Parallel: load all lightweight stores while documents are loading
      // These are all localStorage reads and don't depend on each other or on documents
      const lightweightStores = Promise.all([
        useTagStore.getState().loadTags(),
        useSearchStore.getState().loadHistory(),
        useQuizStore.getState().loadHistory(),
        useQuizStore.getState().loadSavedQuizzes(),
        usePreferenceStore.getState().loadQuizSettingsFromServer(),
        useAnnotationStore.getState().loadAnnotations(),
        useConceptCardStore.getState().loadCards(),
      ])

      // After documents load, register dynamic categories globally
      initDocs.then(() => {
        const docs = useDocumentStore.getState().documents
        const catEntries: { key: string; source: string }[] = []
        for (const doc of docs.values()) {
          if (doc.category && !catEntries.some(e => e.key === doc.category)) {
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

      // lightweightStores is intentionally not awaited — it resolves quickly from localStorage
      // and we don't need it before UI renders
    })
  }, [])
}

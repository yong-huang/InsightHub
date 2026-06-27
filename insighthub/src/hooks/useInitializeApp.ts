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
  const hadDocuments = useRef(false)

  const theme = usePreferenceStore(s => s.theme)
  const docs = useDocumentStore(s => s.documents)

  // Apply theme reactively
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const doInit = () => {
    storageService.migrateChallengeStorage()
    cleanupMigratedLocalData()

    const initDocs = useDocumentStore.getState().initializeDocuments()

    Promise.all([
      useTagStore.getState().loadTags(),
      useSearchStore.getState().loadHistory(),
      useQuizStore.getState().loadHistory(),
      useQuizStore.getState().loadSavedQuizzes(),
      usePreferenceStore.getState().loadQuizSettingsFromServer(),
      useAnnotationStore.getState().loadAnnotations(),
      useConceptCardStore.getState().loadCards(),
    ])

    storageService.syncFromServer().then(() => {
      usePreferenceStore.getState().loadWorkspacesFromServer()
    })

    initDocs.then(() => {
      const currentDocs = useDocumentStore.getState().documents
      hadDocuments.current = currentDocs.size > 0
      const seen = new Set<string>()
      const catEntries: { key: string; source: string }[] = []
      for (const doc of currentDocs.values()) {
        if (doc.category && !seen.has(doc.category)) {
          seen.add(doc.category)
          catEntries.push({ key: doc.category, source: doc.source })
        }
      }
      registerDynamicCategories(catEntries)
      extendCategoryMap(catEntries.map(e => ({
        key: e.key,
        label: getCategoryInfo(e.key).label,
      })))
    })
  }

  // Initialize all data — run once
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    doInit()
  }, [])

  // Detect store reset (e.g. HMR re-executed store module) and re-initialize
  useEffect(() => {
    if (!initialized.current || !hadDocuments.current) return
    if (docs.size === 0) {
      hadDocuments.current = false
      doInit()
    }
  }, [docs])
}

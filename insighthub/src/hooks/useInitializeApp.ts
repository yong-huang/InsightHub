import { useEffect, useRef } from 'react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useTagStore } from '@/stores/tagStore'
import { useSearchStore } from '@/stores/searchStore'
import { useQuizStore } from '@/stores/quizStore'
import { useAnnotationStore } from '@/stores/annotationStore'
import { useConceptCardStore } from '@/stores/conceptCardStore'
import { runIdMigration } from '@/utils/idMigration'

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

    runIdMigration()

    useDocumentStore.getState().initializeDocuments()
    useTagStore.getState().loadTags()
    useSearchStore.getState().loadHistory()
    useQuizStore.getState().loadHistory()
    useQuizStore.getState().loadSavedQuizzes()
    usePreferenceStore.getState().loadQuizSettingsFromServer()
    useAnnotationStore.getState().loadAnnotations()
    useConceptCardStore.getState().loadCards()
  }, [])
}

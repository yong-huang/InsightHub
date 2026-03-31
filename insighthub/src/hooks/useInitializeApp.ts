import { useEffect } from 'react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useTagStore } from '@/stores/tagStore'
import { useSearchStore } from '@/stores/searchStore'
import { useQuizStore } from '@/stores/quizStore'
import { useAnnotationStore } from '@/stores/annotationStore'

export function useInitializeApp() {
  const setTheme = usePreferenceStore(s => s.setTheme)
  const theme = usePreferenceStore(s => s.theme)
  const initializeDocuments = useDocumentStore(s => s.initializeDocuments)
  const loadTags = useTagStore(s => s.loadTags)
  const loadHistory = useSearchStore(s => s.loadHistory)
  const loadQuizHistory = useQuizStore(s => s.loadHistory)
  const loadSavedQuizzes = useQuizStore(s => s.loadSavedQuizzes)
  const loadQuizSettingsFromServer = usePreferenceStore(s => s.loadQuizSettingsFromServer)
  const loadAnnotations = useAnnotationStore(s => s.loadAnnotations)

  useEffect(() => {
    // Apply theme
    document.documentElement.setAttribute('data-theme', theme)

    // Load all data
    initializeDocuments()
    loadTags()
    loadHistory()
    loadQuizHistory()
    loadSavedQuizzes()
    loadQuizSettingsFromServer()
    loadAnnotations()
  }, [setTheme, theme, initializeDocuments, loadTags, loadHistory, loadQuizHistory, loadSavedQuizzes, loadQuizSettingsFromServer, loadAnnotations])
}

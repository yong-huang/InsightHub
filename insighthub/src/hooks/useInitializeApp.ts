import { useEffect } from 'react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useTagStore } from '@/stores/tagStore'
import { useSearchStore } from '@/stores/searchStore'
import { useQuizStore } from '@/stores/quizStore'

export function useInitializeApp() {
  const setTheme = usePreferenceStore(s => s.setTheme)
  const theme = usePreferenceStore(s => s.theme)
  const initializeDocuments = useDocumentStore(s => s.initializeDocuments)
  const loadTags = useTagStore(s => s.loadTags)
  const loadHistory = useSearchStore(s => s.loadHistory)
  const loadQuizHistory = useQuizStore(s => s.loadHistory)
  const loadSavedQuizzes = useQuizStore(s => s.loadSavedQuizzes)

  useEffect(() => {
    // Apply theme
    document.documentElement.setAttribute('data-theme', theme)

    // Load all data
    initializeDocuments()
    loadTags()
    loadHistory()
    loadQuizHistory()
    loadSavedQuizzes()
  }, [setTheme, theme, initializeDocuments, loadTags, loadHistory, loadQuizHistory, loadSavedQuizzes])
}

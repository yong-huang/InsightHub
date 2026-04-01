import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/Layout/Layout'
import { SearchDialog } from '@/components/search/SearchDialog'
import { HomePage } from '@/pages/HomePage'
import { CategoryPage } from '@/pages/CategoryPage'
import { DocReaderPage } from '@/pages/DocReaderPage'
import { SearchPage } from '@/pages/SearchPage'
import { QuizPage } from '@/pages/QuizPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { NotesPage } from '@/pages/NotesPage'
import { StatsPage } from '@/pages/StatsPage'
import { useInitializeApp } from '@/hooks/useInitializeApp'
import { useKeyboard } from '@/hooks/useKeyboard'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'

function AppContent() {
  useInitializeApp()
  useKeyboard()

  return (
    <>
      <ErrorBoundary>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/mindinsight" element={<CategoryPage />} />
            <Route path="/mindinsight/:category" element={<CategoryPage />} />
            <Route path="/techinsight" element={<CategoryPage />} />
            <Route path="/techinsight/:category" element={<CategoryPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/doc/:docId" element={<DocReaderPage />} />
            <Route path="/quiz/:quizId" element={<QuizPage />} />
            <Route path="/tag/:tagId" element={<CategoryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/stats" element={<StatsPage />} />
          </Route>
        </Routes>
      </ErrorBoundary>
      <SearchDialog />
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

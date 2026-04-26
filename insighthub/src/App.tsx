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
import { ReadLaterPage } from '@/pages/ReadLaterPage'
import { AchievementsPage } from '@/pages/AchievementsPage'
import { KnowledgeGraphPage } from '@/pages/KnowledgeGraphPage'
import { LearningPathPage } from '@/pages/LearningPathPage'
import { SpacedRepetitionPage } from '@/pages/SpacedRepetitionPage'
import { AchievementToast } from '@/components/AchievementToast'
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
            {/* Named routes must come before dynamic workspace routes */}
            <Route path="/search" element={<SearchPage />} />
            <Route path="/doc/:docId" element={<DocReaderPage />} />
            <Route path="/quiz/:quizId" element={<QuizPage />} />
            <Route path="/tag/:tagId" element={<CategoryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/read-later" element={<ReadLaterPage />} />
            <Route path="/achievements" element={<AchievementsPage />} />
            <Route path="/knowledge-graph" element={<KnowledgeGraphPage />} />
            <Route path="/learning-path" element={<LearningPathPage />} />
            <Route path="/spaced-repetition" element={<SpacedRepetitionPage />} />
            {/* Dynamic workspace routes — catch-all for workspace IDs */}
            <Route path="/:workspace" element={<CategoryPage />} />
            <Route path="/:workspace/:category" element={<CategoryPage />} />
          </Route>
        </Routes>
      </ErrorBoundary>
      <SearchDialog />
      <AchievementToast />
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

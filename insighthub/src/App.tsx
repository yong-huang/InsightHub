import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/Layout/Layout'
import { SearchDialog } from '@/components/search/SearchDialog'
import { AchievementToast } from '@/components/AchievementToast'
import { useInitializeApp } from '@/hooks/useInitializeApp'
import { useKeyboard } from '@/hooks/useKeyboard'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'

const HomePage = lazy(() => import('@/pages/HomePage').then(m => ({ default: m.HomePage })))
const CategoryPage = lazy(() => import('@/pages/CategoryPage').then(m => ({ default: m.CategoryPage })))
const DocReaderPage = lazy(() => import('@/pages/DocReaderPage').then(m => ({ default: m.DocReaderPage })))
const SearchPage = lazy(() => import('@/pages/SearchPage').then(m => ({ default: m.SearchPage })))
const QuizPage = lazy(() => import('@/pages/QuizPage').then(m => ({ default: m.QuizPage })))
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then(m => ({ default: m.SettingsPage })))
const NotesPage = lazy(() => import('@/pages/NotesPage').then(m => ({ default: m.NotesPage })))
const StatsPage = lazy(() => import('@/pages/StatsPage').then(m => ({ default: m.StatsPage })))
const ReadLaterPage = lazy(() => import('@/pages/ReadLaterPage').then(m => ({ default: m.ReadLaterPage })))
const AchievementsPage = lazy(() => import('@/pages/AchievementsPage').then(m => ({ default: m.AchievementsPage })))
const KnowledgeGraphPage = lazy(() => import('@/pages/KnowledgeGraphPage').then(m => ({ default: m.KnowledgeGraphPage })))
const LearningPathPage = lazy(() => import('@/pages/LearningPathPage').then(m => ({ default: m.LearningPathPage })))
const SpacedRepetitionPage = lazy(() => import('@/pages/SpacedRepetitionPage').then(m => ({ default: m.SpacedRepetitionPage })))

function AppContent() {
  useInitializeApp()
  useKeyboard()

  return (
    <>
      <ErrorBoundary>
        <Suspense fallback={null}>
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
        </Suspense>
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

import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/Layout/Layout'
import { SearchDialog } from '@/components/search/SearchDialog'
import { AchievementToast } from '@/components/AchievementToast'
import { useInitializeApp } from '@/hooks/useInitializeApp'
import { useKeyboard } from '@/hooks/useKeyboard'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { registerPrefetch } from '@/utils/prefetchRoute'

// Import functions — reusable for both lazy() and prefetch
const importHome = () => import('@/pages/HomePage')
const importCategory = () => import('@/pages/CategoryPage')
const importDocReader = () => import('@/pages/DocReaderPage')
const importSearch = () => import('@/pages/SearchPage')
const importQuiz = () => import('@/pages/QuizPage')
const importSettings = () => import('@/pages/SettingsPage')
const importNotes = () => import('@/pages/NotesPage')
const importStats = () => import('@/pages/StatsPage')
const importReadLater = () => import('@/pages/ReadLaterPage')
const importAchievements = () => import('@/pages/AchievementsPage')
const importKnowledgeGraph = () => import('@/pages/KnowledgeGraphPage')
const importLearningPath = () => import('@/pages/LearningPathPage')
const importSpacedRepetition = () => import('@/pages/SpacedRepetitionPage')
const importTokenStats = () => import('@/pages/TokenStatsPage')
const importHiddenDocs = () => import('@/pages/HiddenDocsPage')
const importTrash = () => import('@/pages/TrashPage')

registerPrefetch('/', importHome)
registerPrefetch('/doc', importDocReader)
registerPrefetch('/search', importSearch)
registerPrefetch('/quiz', importQuiz)
registerPrefetch('/settings', importSettings)
registerPrefetch('/notes', importNotes)
registerPrefetch('/stats', importStats)
registerPrefetch('/stats', () => import('@/components/visualization/CategoryRadar'))
registerPrefetch('/stats', () => import('@/components/visualization/QuizPerformancePanel'))
registerPrefetch('/stats', () => import('@/components/visualization/ReadingHabits'))
registerPrefetch('/read-later', importReadLater)
registerPrefetch('/achievements', importAchievements)
registerPrefetch('/knowledge-graph', importKnowledgeGraph)
registerPrefetch('/knowledge-graph', () => import('@/components/visualization/KnowledgeGraph'))
registerPrefetch('/knowledge-graph', () => import('@/components/visualization/PersonalMap'))
registerPrefetch('/learning-path', importLearningPath)
registerPrefetch('/spaced-repetition', importSpacedRepetition)
registerPrefetch('/token-stats', importTokenStats)
registerPrefetch('/hidden-docs', importHiddenDocs)
registerPrefetch('/trash', importTrash)

const HomePage = lazy(() => importHome().then(m => ({ default: m.HomePage })))
const CategoryPage = lazy(() => importCategory().then(m => ({ default: m.CategoryPage })))
const DocReaderPage = lazy(() => importDocReader().then(m => ({ default: m.DocReaderPage })))
const SearchPage = lazy(() => importSearch().then(m => ({ default: m.SearchPage })))
const QuizPage = lazy(() => importQuiz().then(m => ({ default: m.QuizPage })))
const SettingsPage = lazy(() => importSettings().then(m => ({ default: m.SettingsPage })))
const NotesPage = lazy(() => importNotes().then(m => ({ default: m.NotesPage })))
const StatsPage = lazy(() => importStats().then(m => ({ default: m.StatsPage })))
const ReadLaterPage = lazy(() => importReadLater().then(m => ({ default: m.ReadLaterPage })))
const AchievementsPage = lazy(() => importAchievements().then(m => ({ default: m.AchievementsPage })))
const KnowledgeGraphPage = lazy(() => importKnowledgeGraph().then(m => ({ default: m.KnowledgeGraphPage })))
const LearningPathPage = lazy(() => importLearningPath().then(m => ({ default: m.LearningPathPage })))
const SpacedRepetitionPage = lazy(() => importSpacedRepetition().then(m => ({ default: m.SpacedRepetitionPage })))
const TokenStatsPage = lazy(() => importTokenStats().then(m => ({ default: m.TokenStatsPage })))
const HiddenDocsPage = lazy(() => importHiddenDocs().then(m => ({ default: m.HiddenDocsPage })))
const TrashPage = lazy(() => importTrash().then(m => ({ default: m.TrashPage })))

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
              <Route path="/token-stats" element={<TokenStatsPage />} />
              <Route path="/hidden-docs" element={<HiddenDocsPage />} />
              <Route path="/trash" element={<TrashPage />} />
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

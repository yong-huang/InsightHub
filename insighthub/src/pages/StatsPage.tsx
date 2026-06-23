import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Monitor, Globe } from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useQuizStore } from '@/stores/quizStore'
import { useTagStore } from '@/stores/tagStore'
import { useAnnotationStore } from '@/stores/annotationStore'
import { storageService } from '@/services/storageService'
import { buildReportData, type ReportPeriod } from '@/utils/reportAggregator'
import { ChartCard } from '@/components/stats/ChartCard'
import { ReadingHeatmap } from '@/components/stats/ReadingHeatmap'
import { ReportHero } from '@/components/visualization/ReportHero'
import { TopEngagedDocuments } from '@/components/visualization/TopEngagedDocuments'
import { TagCloud } from '@/components/visualization/TagCloud'

const CategoryRadar = lazy(() =>
  import('@/components/visualization/CategoryRadar').then(m => ({ default: m.CategoryRadar }))
)
const QuizPerformancePanel = lazy(() =>
  import('@/components/visualization/QuizPerformancePanel').then(m => ({ default: m.QuizPerformancePanel }))
)
const ReadingHabits = lazy(() =>
  import('@/components/visualization/ReadingHabits').then(m => ({ default: m.ReadingHabits }))
)

const PERIODS: { key: ReportPeriod; label: string }[] = [
  { key: 'month', label: 'This Month' },
  { key: 'year', label: 'This Year' },
  { key: 'all', label: 'All Time' },
]

export function StatsPage() {
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const workspaces = usePreferenceStore(s => s.workspaces)
  const documents = useDocumentStore(s => s.documents)
  const quizHistory = useQuizStore(s => s.quizHistory)
  const tags = useTagStore(s => s.tags)
  const annotations = useAnnotationStore(s => s.annotations)
  const isLoading = useDocumentStore(s => s.isLoading)
  const refreshReadMeta = useDocumentStore(s => s.refreshReadMeta)
  const readHistory = useMemo(() => storageService.getReadHistory(), [isLoading])
  const achievementState = useMemo(() => storageService.getAchievementState(), [isLoading])

  // Re-sync isRead from localStorage when entering StatsPage
  useEffect(() => {
    if (!isLoading) refreshReadMeta()
  }, [isLoading, refreshReadMeta])

  // Resolve activeWorkspace (may be id or prefix) to the document source prefix
  const activeSource = useMemo(() => {
    if (!activeWorkspace) return undefined
    // If it matches a document source directly, use it
    const docSources = new Set(Array.from(documents.values()).map(d => d.source))
    if (docSources.has(activeWorkspace)) return activeWorkspace
    // Otherwise look up the workspace config by id to get the prefix
    const ws = workspaces.find(w => w.id === activeWorkspace)
    return ws?.prefix || activeWorkspace
  }, [activeWorkspace, documents, workspaces])

  const [scope, setScope] = useState<'workspace' | 'global'>('workspace')
  const [period, setPeriod] = useState<ReportPeriod>('all')

  const source = scope === 'global' ? undefined : activeSource

  const report = useMemo(
    () => buildReportData(documents, tags, quizHistory, annotations, readHistory, achievementState, period, source),
    [documents, tags, quizHistory, annotations, readHistory, achievementState, period, source],
  )

  return (
    <div className="cs-settings">
      <div className="cs-settings-header">
        <div className="cs-section-label">STATISTICS</div>
        <h1>Statistics</h1>
        <p className="cs-settings-subtitle">
          {scope === 'global' ? 'Learning progress across all workspaces.' : 'Track your learning progress and reading habits.'}
        </p>
      </div>

      {/* Scope selector */}
      <div className="cs-btn-group" style={{ marginBottom: '0.75rem' }}>
        <button
          className={`cs-btn ${scope === 'workspace' ? 'cs-btn-primary' : 'cs-btn-secondary'}`}
          onClick={() => setScope('workspace')}
        >
          <Monitor size={15} />
          Current Workspace
        </button>
        <button
          className={`cs-btn ${scope === 'global' ? 'cs-btn-primary' : 'cs-btn-secondary'}`}
          onClick={() => setScope('global')}
        >
          <Globe size={15} />
          Global
        </button>
      </div>

      {/* Period selector */}
      <div className="cs-btn-group" style={{ marginBottom: '1.25rem' }}>
        {PERIODS.map(p => (
          <button
            key={p.key}
            className={`cs-btn ${period === p.key ? 'cs-btn-primary' : 'cs-btn-secondary'}`}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Hero overview */}
      <ReportHero data={report.overview} />

      {/* Heatmap */}
      <ChartCard title="Reading Heatmap">
        <ReadingHeatmap entries={readHistory} documents={documents} source={source} />
      </ChartCard>

      {/* Two-column: Category Radar + Quiz Performance */}
      <div className="cs-stats-grid-2">
        <ChartCard title="Category Exploration Radar">
          <Suspense fallback={null}>
            <CategoryRadar data={report.categoryDistribution} />
          </Suspense>
        </ChartCard>
        <ChartCard title="Quiz Performance">
          <Suspense fallback={null}>
            <QuizPerformancePanel data={report.quizPerformance} />
          </Suspense>
        </ChartCard>
      </div>

      {/* Two-column: Top Annotated + Top Quizzed */}
      <div className="cs-stats-grid-2">
        <ChartCard title="Most Annotated Documents">
          <TopEngagedDocuments title="Most Annotated" data={report.topAnnotated} unit="annotations" />
        </ChartCard>
        <ChartCard title="Most Quizzed Documents">
          <TopEngagedDocuments title="Most Quizzed" data={report.topQuizzed} unit="quizzes" />
        </ChartCard>
      </div>

      {/* Reading habits */}
      <ChartCard title="Reading Habits">
        <Suspense fallback={null}>
          <ReadingHabits data={report.readingHabits} />
        </Suspense>
      </ChartCard>

      {/* Tag cloud */}
      <ChartCard title="Tag Cloud">
        <TagCloud data={report.tagCloud} />
      </ChartCard>
    </div>
  )
}

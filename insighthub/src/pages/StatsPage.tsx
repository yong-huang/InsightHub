import '@/styles/stats.css'
import { lazy, Suspense, useMemo, useState } from 'react'
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
  const documents = useDocumentStore(s => s.documents)
  const quizHistory = useQuizStore(s => s.quizHistory)
  const tags = useTagStore(s => s.tags)
  const annotations = useAnnotationStore(s => s.annotations)
  const readHistory = useMemo(() => storageService.getReadHistory(), [])
  const achievementState = useMemo(() => storageService.getAchievementState(), [])

  const [period, setPeriod] = useState<ReportPeriod>('all')

  const report = useMemo(
    () => buildReportData(documents, tags, quizHistory, annotations, readHistory, achievementState, period, activeWorkspace),
    [documents, tags, quizHistory, annotations, readHistory, achievementState, period, activeWorkspace],
  )

  return (
    <div className="cs-settings">
      <div className="cs-settings-header">
        <div className="cs-section-label">STATISTICS</div>
        <h1>Statistics</h1>
        <p className="cs-settings-subtitle">Track your learning progress and reading habits.</p>
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
        <ReadingHeatmap entries={readHistory} documents={documents} source={activeWorkspace} />
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

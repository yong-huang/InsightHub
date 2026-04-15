import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
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
import { CategoryRadar } from '@/components/visualization/CategoryRadar'
import { QuizPerformancePanel } from '@/components/visualization/QuizPerformancePanel'
import { TopEngagedDocuments } from '@/components/visualization/TopEngagedDocuments'
import { ReadingHabits } from '@/components/visualization/ReadingHabits'
import { TagCloud } from '@/components/visualization/TagCloud'

export function StatsPage() {
  const navigate = useNavigate()
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
    <div className="stats-page">
      <div className="stats-page-header">
        <div className="page-header-row">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} title="返回">
            <ArrowLeft size={18} />
          </button>
          <h1 className="stats-page-title">数据统计</h1>
        </div>
        <p className="stats-page-desc">了解你的学习进度和阅读习惯</p>
        <div className="viz-period-selector" style={{ marginTop: '0.75rem' }}>
          {([
            { key: 'month' as const, label: '本月' },
            { key: 'year' as const, label: '今年' },
            { key: 'all' as const, label: '全部' },
          ]).map(p => (
            <button
              key={p.key}
              className={period === p.key ? 'active' : ''}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hero overview */}
      <ReportHero data={report.overview} />

      {/* Heatmap */}
      <ChartCard title="阅读热力图">
        <ReadingHeatmap entries={readHistory} documents={documents} source={activeWorkspace} />
      </ChartCard>

      {/* Two-column: Category Radar + Quiz Performance */}
      <div className="stats-grid-2">
        <ChartCard title="分类探索雷达">
          <CategoryRadar data={report.categoryDistribution} />
        </ChartCard>
        <ChartCard title="测验表现">
          <QuizPerformancePanel data={report.quizPerformance} />
        </ChartCard>
      </div>

      {/* Two-column: Top Annotated + Top Quizzed */}
      <div className="stats-grid-2">
        <ChartCard title="最常批注文档">
          <TopEngagedDocuments data={report.topAnnotated} unit="条批注" />
        </ChartCard>
        <ChartCard title="最常测验文档">
          <TopEngagedDocuments data={report.topQuizzed} unit="次测验" />
        </ChartCard>
      </div>

      {/* Reading habits */}
      <ChartCard title="阅读习惯">
        <ReadingHabits data={report.readingHabits} />
      </ChartCard>

      {/* Tag cloud */}
      <ChartCard title="标签云">
        <TagCloud data={report.tagCloud} />
      </ChartCard>
    </div>
  )
}

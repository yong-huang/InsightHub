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

export function LearningReportPage() {
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
    <div className="viz-page">
      <div className="viz-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} title="返回">
            <ArrowLeft size={18} />
          </button>
          <h1 className="viz-page-title">学习报告</h1>
        </div>
        <p className="viz-page-desc">全面了解你的学习轨迹和成果</p>
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

      {/* 1. Hero overview */}
      <ReportHero data={report.overview} />

      {/* 2. Heatmap (always shows full year) */}
      <ChartCard title="阅读日历">
        <ReadingHeatmap entries={readHistory} documents={documents} source={activeWorkspace} />
      </ChartCard>

      {/* 3. Category Radar */}
      <ChartCard title="分类探索雷达">
        <CategoryRadar data={report.categoryDistribution} />
      </ChartCard>

      {/* 4. Quiz Performance */}
      <ChartCard title="测验表现">
        <QuizPerformancePanel data={report.quizPerformance} />
      </ChartCard>

      {/* 5. Top engaged documents (2-col) */}
      <div className="report-grid-2">
        <ChartCard title="最常批注文档">
          <TopEngagedDocuments title="" data={report.topAnnotated} unit="条批注" />
        </ChartCard>
        <ChartCard title="最常测验文档">
          <TopEngagedDocuments title="" data={report.topQuizzed} unit="次测验" />
        </ChartCard>
      </div>

      {/* 6. Reading habits */}
      <ChartCard title="阅读习惯">
        <ReadingHabits data={report.readingHabits} />
      </ChartCard>

      {/* 7. Tag cloud */}
      <ChartCard title="标签云">
        <TagCloud data={report.tagCloud} />
      </ChartCard>
    </div>
  )
}

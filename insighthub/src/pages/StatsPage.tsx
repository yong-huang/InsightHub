import { useMemo } from 'react'
import { BookOpen, Brain, MessageSquare, FileText } from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useQuizStore } from '@/stores/quizStore'
import { useAnnotationStore } from '@/stores/annotationStore'
import { storageService } from '@/services/storageService'
import { ChartCard } from '@/components/stats/ChartCard'
import { ReadingHeatmap } from '@/components/stats/ReadingHeatmap'
import { ReadingTrend } from '@/components/stats/ReadingTrend'
import { CategoryCompletion } from '@/components/stats/CategoryCompletion'
import { QuizScoreTrend } from '@/components/stats/QuizScoreTrend'
import { AnnotationStats } from '@/components/stats/AnnotationStats'
import { WordCountDist } from '@/components/stats/WordCountDist'

export function StatsPage() {
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const documents = useDocumentStore(s => s.documents)
  const quizHistory = useQuizStore(s => s.quizHistory)
  const annotations = useAnnotationStore(s => s.annotations)
  const readHistory = useMemo(() => storageService.getReadHistory(), [])

  const source = activeWorkspace

  // Overview stats
  const overviewStats = useMemo(() => {
    const docs = Array.from(documents.values()).filter(d => d.source === source)
    const readDocs = docs.filter(d => d.isRead)
    const totalWords = readDocs.reduce((s, d) => s + d.wordCount, 0)
    const quizCount = quizHistory.filter(a => {
      const doc = documents.get(a.documentId)
      return doc?.source === source
    }).length
    const annotationCount = annotations.filter(a => {
      const doc = documents.get(a.documentId)
      return doc?.source === source
    }).length

    return [
      { icon: <BookOpen size={20} />, label: '已读文档', value: readDocs.length, color: 'var(--accent-green)' },
      { icon: <Brain size={20} />, label: '测验次数', value: quizCount, color: 'var(--accent-purple)' },
      { icon: <MessageSquare size={20} />, label: '批注数', value: annotationCount, color: 'var(--accent-orange)' },
      { icon: <FileText size={20} />, label: '阅读总字数', value: totalWords, color: 'var(--accent-blue)', format: true },
    ]
  }, [documents, source, quizHistory, annotations])

  const formatNumber = (n: number) => {
    if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
    return String(n)
  }

  return (
    <div className="stats-page">
      <div className="stats-page-header">
        <h1 className="stats-page-title">数据统计</h1>
        <p className="stats-page-desc">了解你的学习进度和阅读习惯</p>
      </div>

      {/* Overview stat cards */}
      <div className="stats-overview-grid">
        {overviewStats.map(stat => (
          <div key={stat.label} className="stats-overview-card">
            <div className="stats-overview-icon" style={{ color: stat.color }}>
              {stat.icon}
            </div>
            <div className="stats-overview-value">
              {stat.format ? formatNumber(stat.value) : stat.value}
            </div>
            <div className="stats-overview-label">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Heatmap */}
      <ChartCard title="阅读热力图">
        <ReadingHeatmap entries={readHistory} documents={documents} source={source} />
      </ChartCard>

      {/* Reading Trend */}
      <ChartCard title="阅读趋势">
        <ReadingTrend entries={readHistory} documents={documents} source={source} />
      </ChartCard>

      {/* Two-column: Category Completion + Quiz Score Trend */}
      <div className="stats-grid-2">
        <ChartCard title="分类完成率">
          <CategoryCompletion documents={documents} source={source} />
        </ChartCard>
        <ChartCard title="测验成绩趋势">
          <QuizScoreTrend attempts={quizHistory} documents={documents} source={source} />
        </ChartCard>
      </div>

      {/* Two-column: Annotation Stats + Word Count Dist */}
      <div className="stats-grid-2">
        <ChartCard title="批注统计">
          <AnnotationStats annotations={annotations} documents={documents} source={source} />
        </ChartCard>
        <ChartCard title="文档字数分布">
          <WordCountDist documents={documents} source={source} />
        </ChartCard>
      </div>
    </div>
  )
}

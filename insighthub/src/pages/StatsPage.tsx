import { lazy, Suspense, useEffect, useState } from 'react'
import { Monitor, Globe } from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { buildReportData, type ReportData, type ReportPeriod } from '@/utils/reportAggregator'
import type { Document } from '@/types'
import type { ReadHistoryEntry } from '@/services/storageService'
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

  const [scope, setScope] = useState<'workspace' | 'global'>('workspace')
  const [period, setPeriod] = useState<ReportPeriod>('all')
  const [report, setReport] = useState<ReportData | null>(null)
  const [docs, setDocs] = useState<Map<string, Document> | null>(null)
  const [readHistory, setReadHistory] = useState<ReadHistoryEntry[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // activeWorkspace IS the document source (workspace ID), matching document.source in manifest
  const source = scope === 'global' ? undefined : activeWorkspace

  // Fetch fresh data from server endpoints on every mount + scope/period change
  useEffect(() => {
    let cancelled = false
    async function loadStats() {
      setIsLoading(true)
      try {
        const bust = `?_t=${Date.now()}`
        const [manifestRes, readMetaRes, readHistoryRes, annotationsRes, quizHistoryRes, tagsRes, clientStorageRes] = await Promise.all([
          fetch('/api/documents' + bust),
          fetch('/api/read-meta' + bust),
          fetch('/api/read-history' + bust),
          fetch('/api/annotations' + bust),
          fetch('/api/quiz-history' + bust),
          fetch('/api/tags' + bust),
          fetch('/api/client-storage' + bust),
        ])
        if (cancelled) return

        const manifest = await manifestRes.json()
        const readMeta = await readMetaRes.json() as Record<string, { isRead?: boolean }>
        const readHistory = await readHistoryRes.json()
        const annotations = await annotationsRes.json()
        const quizHistory = await quizHistoryRes.json()
        const tags = await tagsRes.json()
        const clientStorage = await clientStorageRes.json()

        if (cancelled) return

        // Build documents Map from manifest (only fields used by buildReportData)
        const docs = new Map<string, Document>()
        const entries = manifest.documents || manifest
        for (const entry of entries) {
          docs.set(entry.id, {
            id: entry.id,
            title: entry.title || (entry.fileName || '').replace(/\.html$/, ''),
            source: entry.source,
            category: entry.category,
            wordCount: entry.wordCount || 0,
            isRead: !!readMeta[entry.id]?.isRead,
          } as Document)
        }

        // Build readDocIdSet from server read-meta
        const readIds = Object.entries(readMeta)
          .filter(([, m]) => m.isRead)
          .map(([id]) => id)
        const readDocIdSet = readIds.length > 0 ? new Set(readIds) : undefined

        // Achievement state from client-storage
        const achKey = 'insighthub:achievements'
        const achData = clientStorage[achKey]

        const result = buildReportData(docs, tags || [], quizHistory || [], annotations || [], readHistory || [], achData || { unlockedIds: [], unlockedAt: {} }, period, source, readDocIdSet)
        setReport(result)
        setDocs(docs)
        setReadHistory(readHistory || [])
      } catch (e) {
        console.error('Failed to load stats:', e)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    loadStats()
    return () => { cancelled = true }
  }, [period, source])

  if (isLoading || !report || !docs || !readHistory) {
    return (
      <div className="cs-settings" style={{ textAlign: 'center', paddingTop: '4rem' }}>
        <p className="cs-empty-hint">Loading statistics…</p>
      </div>
    )
  }

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
        <ReadingHeatmap entries={readHistory} documents={docs} source={source} />
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

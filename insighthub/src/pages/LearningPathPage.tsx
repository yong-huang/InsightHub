import { useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowLeft, Map, Clock, BookOpen, Highlighter, BrainCircuit, Layers, Trophy,
} from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useAnnotationStore } from '@/stores/annotationStore'
import { useQuizStore } from '@/stores/quizStore'
import { useFlashcardStore } from '@/stores/flashcardStore'
import { buildPathData } from '@/utils/pathBuilder'
import { WORKSPACE_META } from '@/utils/categoryMap'
import { buildTimeline, groupByDate, type TimelineTypeFilter, type TimelineEntry } from '@/utils/timelineBuilder'
import { ChartCard } from '@/components/stats/ChartCard'
import { LearningPath } from '@/components/visualization/LearningPath'

type ActiveTab = 'path' | 'timeline'

const TYPE_ICONS: Record<string, React.ReactNode> = {
  read: <BookOpen size={14} />,
  annotation: <Highlighter size={14} />,
  quiz: <BrainCircuit size={14} />,
  review: <Layers size={14} />,
  achievement: <Trophy size={14} />,
}

const TYPE_LABELS: Record<string, string> = {
  read: 'Reading',
  annotation: 'Annotation',
  quiz: 'Quiz',
  review: 'Review',
  achievement: 'Achievement',
}

const FILTER_OPTIONS: { key: TimelineTypeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'read', label: 'Reading' },
  { key: 'annotation', label: 'Annotation' },
  { key: 'quiz', label: 'Quiz' },
  { key: 'review', label: 'Review' },
  { key: 'achievement', label: 'Achievement' },
]

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function LearningPathPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const documents = useDocumentStore(s => s.documents)
  const annotations = useAnnotationStore(s => s.annotations)
  const quizHistory = useQuizStore(s => s.quizHistory)
  const flashcards = useFlashcardStore(s => s.cards)
  const [activeTab, setActiveTab] = useState<ActiveTab>('path')
  const [typeFilter, setTypeFilter] = useState<TimelineTypeFilter>('all')

  const pathData = useMemo(() => buildPathData(documents, activeWorkspace), [documents, activeWorkspace])

  const entries = useMemo(
    () => buildTimeline(documents, annotations, quizHistory, flashcards, {
      source: activeWorkspace,
      typeFilter,
      limit: 200,
    }),
    [documents, annotations, quizHistory, flashcards, activeWorkspace, typeFilter],
  )

  const dateGroups = useMemo(() => groupByDate(entries), [entries])

  return (
    <div className="viz-page page-timeline">
      <div className="viz-page-header">
        <div className="page-header-row">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} title="Back">
            <ArrowLeft size={18} />
          </button>
          <h1 className="viz-page-title">Learning Path</h1>
        </div>
        <div className="viz-tab-bar">
          <button
            className={`viz-tab ${activeTab === 'path' ? 'active' : ''}`}
            onClick={() => setActiveTab('path')}
          >
            <Map size={15} />
            Learning Path
          </button>
          <button
            className={`viz-tab ${activeTab === 'timeline' ? 'active' : ''}`}
            onClick={() => setActiveTab('timeline')}
          >
            <Clock size={15} />
            Timeline
          </button>
        </div>
        <p className="viz-page-desc">
          {activeTab === 'path'
            ? 'Track learning progress across categories and discover next steps'
            : 'View all your learning activity records'}
        </p>
      </div>

      {activeTab === 'path' ? (
        <ChartCard title={`${WORKSPACE_META[activeWorkspace]?.label || 'LeetcodeInsight'} Learning Path`}>
          <LearningPath data={pathData} source={activeWorkspace} />
        </ChartCard>
      ) : (
        <>
          <div className="viz-period-selector" style={{ marginBottom: '1.5rem' }}>
            {FILTER_OPTIONS.map(opt => (
              <button
                key={opt.key}
                className={typeFilter === opt.key ? 'active' : ''}
                onClick={() => setTypeFilter(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {entries.length === 0 ? (
            <div className="empty-state">
              <Clock size={48} />
              <h3>No Activity Records</h3>
              <p>Start reading and annotating documents to see your activity here</p>
            </div>
          ) : (
            <div className="timeline-container">
              {dateGroups.map(group => (
                <div key={group.date} className="timeline-date-group">
                  <div className="timeline-date-label">{group.label}</div>
                  <div className="timeline-items">
                    {group.entries.map(entry => (
                      <TimelineItem
                        key={entry.id}
                        entry={entry}
                        onClick={() => entry.documentId && navigate(`/doc/${entry.documentId}`, { state: { from: location.pathname } })}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TimelineItem({ entry, onClick }: { entry: TimelineEntry; onClick: () => void }) {
  return (
    <div
      className={`timeline-item ${entry.documentId ? 'clickable' : ''}`}
      onClick={entry.documentId ? onClick : undefined}
    >
      <div className="timeline-item-dot" style={{ backgroundColor: entry.color }}>
        {TYPE_ICONS[entry.type]}
      </div>
      <div className="timeline-item-content">
        <div className="timeline-item-summary">{entry.summary}</div>
        {entry.detail && (
          <div className="timeline-item-detail">{entry.detail}</div>
        )}
        <div className="timeline-item-meta">
          <span className="timeline-item-type-badge" style={{ color: entry.color }}>
            {TYPE_LABELS[entry.type]}
          </span>
          <span className="timeline-item-time">{formatTime(entry.timestamp)}</span>
        </div>
      </div>
    </div>
  )
}

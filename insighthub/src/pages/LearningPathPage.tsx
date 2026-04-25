import { useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Map, Clock, BookOpen, Highlighter, BrainCircuit, Layers, Trophy,
} from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useAnnotationStore } from '@/stores/annotationStore'
import { useQuizStore } from '@/stores/quizStore'
import { useFlashcardStore } from '@/stores/flashcardStore'
import { buildPathData } from '@/utils/pathBuilder'
import { getWorkspaceConfig } from '@/utils/workspaceUtils'
import { buildTimeline, groupByDate, type TimelineTypeFilter, type TimelineEntry } from '@/utils/timelineBuilder'
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
  const workspaces = usePreferenceStore(s => s.workspaces)
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
    }),
    [documents, annotations, quizHistory, flashcards, activeWorkspace, typeFilter],
  )

  const dateGroups = useMemo(() => groupByDate(entries), [entries])

  const handleFilterChange = (key: TimelineTypeFilter) => {
    setTypeFilter(key)
  }

  const workspaceLabel = getWorkspaceConfig(activeWorkspace, workspaces)?.label || 'Learning'

  return (
    <div className="cs-settings">
      <div className="cs-settings-header">
        <div className="cs-section-label">LEARNING</div>
        <h1>Learning Path</h1>
        <p className="cs-settings-subtitle">Track learning progress across categories and discover next steps</p>
      </div>

      {/* Tab buttons */}
      <div className="cs-btn-group" style={{ marginBottom: '1.25rem' }}>
        <button
          className={`cs-btn ${activeTab === 'path' ? 'cs-btn-primary' : 'cs-btn-secondary'}`}
          onClick={() => setActiveTab('path')}
        >
          <Map size={14} /> Learning Path
        </button>
        <button
          className={`cs-btn ${activeTab === 'timeline' ? 'cs-btn-primary' : 'cs-btn-secondary'}`}
          onClick={() => setActiveTab('timeline')}
        >
          <Clock size={14} /> Activity Timeline
        </button>
      </div>

      {activeTab === 'path' ? (
        <div className="cs-card">
          <div className="cs-card-header">{workspaceLabel.toUpperCase()} LEARNING PATH</div>
          <div className="cs-card-body">
            <LearningPath data={pathData} source={activeWorkspace} />
          </div>
        </div>
      ) : (
        <div className="cs-card">
          <div className="cs-card-header">ACTIVITY TIMELINE</div>
          <div className="cs-card-body">
            {/* Filter buttons */}
            <div className="cs-btn-group" style={{ marginBottom: '1rem' }}>
              {FILTER_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  className={`cs-btn ${typeFilter === opt.key ? 'cs-btn-primary' : 'cs-btn-secondary'}`}
                  onClick={() => handleFilterChange(opt.key)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {entries.length === 0 ? (
              <div className="cs-empty-hint">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-dim)' }}>
                  <Clock size={20} />
                </div>
                Start reading and annotating documents to see your activity here.
              </div>
            ) : (
              <>
                <div className="cs-timeline">
                  {dateGroups.map(group => (
                    <div key={group.date} className="cs-timeline-group">
                      <div className="cs-timeline-date-label">{group.label}</div>
                      <div className="cs-timeline-items">
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
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TimelineItem({ entry, onClick }: { entry: TimelineEntry; onClick: () => void }) {
  return (
    <div
      className={`cs-timeline-item ${entry.documentId ? 'clickable' : ''}`}
      onClick={entry.documentId ? onClick : undefined}
    >
      <div className="cs-timeline-dot" style={{ backgroundColor: entry.color }}>
        {TYPE_ICONS[entry.type]}
      </div>
      <div className="cs-timeline-item-content">
        <div className="cs-timeline-item-summary">{entry.summary}</div>
        {entry.detail && (
          <div className="cs-timeline-item-detail">{entry.detail}</div>
        )}
        <div className="cs-timeline-item-meta">
          <span className="cs-timeline-item-type" style={{ color: entry.color }}>
            {TYPE_LABELS[entry.type]}
          </span>
          <span className="cs-timeline-item-time">{formatTime(entry.timestamp)}</span>
        </div>
      </div>
    </div>
  )
}

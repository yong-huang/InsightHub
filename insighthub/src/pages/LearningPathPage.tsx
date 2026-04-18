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
  read: '阅读',
  annotation: '标注',
  quiz: '测验',
  review: '复习',
  achievement: '成就',
}

const FILTER_OPTIONS: { key: TimelineTypeFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'read', label: '阅读' },
  { key: 'annotation', label: '标注' },
  { key: 'quiz', label: '测验' },
  { key: 'review', label: '复习' },
  { key: 'achievement', label: '成就' },
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
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} title="返回">
            <ArrowLeft size={18} />
          </button>
          <h1 className="viz-page-title">学习路径</h1>
        </div>
        <div className="viz-tab-bar">
          <button
            className={`viz-tab ${activeTab === 'path' ? 'active' : ''}`}
            onClick={() => setActiveTab('path')}
          >
            <Map size={15} />
            学习路径
          </button>
          <button
            className={`viz-tab ${activeTab === 'timeline' ? 'active' : ''}`}
            onClick={() => setActiveTab('timeline')}
          >
            <Clock size={15} />
            时间线
          </button>
        </div>
        <p className="viz-page-desc">
          {activeTab === 'path'
            ? '追踪各分类的学习进度，发现下一步学习方向'
            : '查看你的所有学习活动记录'}
        </p>
      </div>

      {activeTab === 'path' ? (
        <ChartCard title={`${WORKSPACE_META[activeWorkspace]?.label || 'LeetcodeInsight'} 学习路径`}>
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
              <h3>暂无活动记录</h3>
              <p>开始阅读和标注文档后，你的活动会出现在这里</p>
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

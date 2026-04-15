import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Lightbulb, RotateCcw, Trash2, BookOpen,
  Clock, CheckCircle2, AlertCircle, Star, Zap, Search,
} from 'lucide-react'
import { useConceptCardStore } from '@/stores/conceptCardStore'
import { useDocumentStore } from '@/stores/documentStore'
import { usePreferenceStore } from '@/stores/preferenceStore'
import type { ConceptCard } from '@/types'

type ViewMode = 'review' | 'list'

const GRADES = [
  { grade: 0, label: '忘了', color: '#ef4444' },
  { grade: 1, label: '困难', color: '#f97316' },
  { grade: 2, label: '吃力', color: '#eab308' },
  { grade: 3, label: '犹豫', color: '#22c55e' },
  { grade: 4, label: '容易', color: '#10b981' },
  { grade: 5, label: '简单', color: '#14b8a6' },
] as const

export function SpacedRepetitionPage() {
  const navigate = useNavigate()
  const { cards, isLoaded, loadCards, reviewCard, removeCard, skipCard } = useConceptCardStore()
  const documents = useDocumentStore(s => s.documents)
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)

  const workspaceCards = useMemo(() =>
    cards.filter(c => {
      const doc = documents.get(c.sourceDocId)
      return doc?.source === activeWorkspace || c.sourceDocId.startsWith(activeWorkspace === 'mindinsight' ? 'mi-' : 'ti-')
    }),
    [cards, documents, activeWorkspace]
  )

  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('review')
  const [flipped, setFlipped] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(0)

  const filteredCards = useMemo(() => {
    if (!searchQuery.trim()) return workspaceCards
    const q = searchQuery.toLowerCase()
    return workspaceCards.filter(c => {
      const doc = documents.get(c.sourceDocId)
      return (
        c.conceptName.toLowerCase().includes(q) ||
        c.definition.toLowerCase().includes(q) ||
        c.examples?.some(e => e.toLowerCase().includes(q)) ||
        c.relatedConcepts?.some(r => r.toLowerCase().includes(q)) ||
        (doc?.title.toLowerCase().includes(q))
      )
    })
  }, [workspaceCards, searchQuery, documents])

  const [sessionResults, setSessionResults] = useState<{ cardId: string; grade: number }[]>([])
  const [sessionDone, setSessionDone] = useState(false)
  const [slidingOut, setSlidingOut] = useState(false)

  useEffect(() => {
    if (!isLoaded) loadCards()
  }, [isLoaded, loadCards])

  const dueCards = useMemo(() => {
    const now = Date.now()
    return filteredCards
      .filter(c => c.nextReview <= now)
      .sort((a, b) => a.nextReview - b.nextReview)
  }, [filteredCards])

  const stats = useMemo(() => {
    let due = 0, newCount = 0, learning = 0, mastered = 0
    for (const c of workspaceCards) {
      if (c.nextReview <= Date.now()) due++
      if (c.lastReview === 0) newCount++
      else if (c.interval < 21) learning++
      else mastered++
    }
    return { total: workspaceCards.length, due, new: newCount, learning, mastered }
  }, [workspaceCards])

  const currentCard = dueCards[currentIdx] ?? null

  const handleGrade = useCallback((grade: number) => {
    if (!currentCard) return
    setSlidingOut(true)
    setTimeout(() => {
      reviewCard(currentCard.id, grade)
      setSessionResults(prev => [...prev, { cardId: currentCard.id, grade }])
      setFlipped(false)
      setSlidingOut(false)
      if (currentIdx + 1 >= dueCards.length) {
        setSessionDone(true)
      } else {
        setCurrentIdx(i => i + 1)
      }
    }, 200)
  }, [currentCard, currentIdx, dueCards.length, reviewCard])

  const handleFlip = useCallback(() => {
    if (!currentCard) return
    setFlipped(f => !f)
  }, [currentCard])

  const handleSkip = useCallback(() => {
    if (!currentCard) return
    skipCard(currentCard.id)
    setFlipped(false)
    if (currentIdx + 1 >= dueCards.length) {
      setSessionDone(true)
    } else {
      setCurrentIdx(i => i + 1)
    }
  }, [currentCard, currentIdx, dueCards.length, skipCard])

  const startNewSession = useCallback(() => {
    setCurrentIdx(0)
    setFlipped(false)
    setSessionResults([])
    setSessionDone(false)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (sessionDone || viewMode !== 'review') return
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault()
        handleFlip()
      } else if (e.key >= '0' && e.key <= '5' && flipped) {
        handleGrade(Number(e.key))
      } else if (e.key === 's' || e.key === 'S') {
        handleSkip()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [flipped, sessionDone, viewMode, handleFlip, handleGrade, handleSkip])

  const sessionCorrect = sessionResults.filter(r => r.grade >= 3).length
  const sessionTotal = sessionResults.length

  return (
    <div className="spaced-repetition-page">
      <div className="viz-page-header">
        <div className="page-header-row">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} title="返回">
            <ArrowLeft size={18} />
          </button>
          <h1 className="viz-page-title">概念卡片</h1>
          <div className="page-header-actions">
            <button
              className={`sr-view-toggle ${viewMode === 'review' ? 'active' : ''}`}
              onClick={() => setViewMode('review')}
            >
              <RotateCcw size={16} />
              复习模式
            </button>
            <button
              className={`sr-view-toggle ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              <Lightbulb size={16} />
              全部卡片
            </button>
          </div>
        </div>
        <p className="viz-page-desc">通过间隔复习巩固 AI 从文档中提取的核心概念</p>
      </div>

      <div className="sr-stats-bar">
        <div className="sr-stat">
          <div className="sr-stat-icon" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
            <Clock size={20} />
          </div>
          <div className="sr-stat-info">
            <span className="sr-stat-value">{stats.due}</span>
            <span className="sr-stat-label">待复习</span>
          </div>
        </div>
        <div className="sr-stat">
          <div className="sr-stat-icon" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
            <Zap size={20} />
          </div>
          <div className="sr-stat-info">
            <span className="sr-stat-value">{stats.new}</span>
            <span className="sr-stat-label">新卡片</span>
          </div>
        </div>
        <div className="sr-stat">
          <div className="sr-stat-icon" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
            <AlertCircle size={20} />
          </div>
          <div className="sr-stat-info">
            <span className="sr-stat-value">{stats.learning}</span>
            <span className="sr-stat-label">学习中</span>
          </div>
        </div>
        <div className="sr-stat">
          <div className="sr-stat-icon" style={{ background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}>
            <Star size={20} />
          </div>
          <div className="sr-stat-info">
            <span className="sr-stat-value">{stats.mastered}</span>
            <span className="sr-stat-label">已掌握</span>
          </div>
        </div>
      </div>

      {workspaceCards.length > 0 && (
        <div className="search-page-input-wrap" style={{ margin: '0.75rem 0' }}>
          <Search size={16} />
          <input
            type="search"
            className="search-page-input"
            placeholder="搜索概念卡片..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      )}

      {viewMode === 'review' && sessionTotal > 0 && (
        <div className="sr-progress">
          <div className="sr-progress-bar">
            <div
              className="sr-progress-fill"
              style={{ width: `${Math.round((sessionCorrect / sessionTotal) * 100)}%` }}
            />
          </div>
          <span className="sr-progress-text">{sessionCorrect}/{sessionTotal} 正确</span>
        </div>
      )}

      {viewMode === 'review' && renderReviewMode()}
      {viewMode === 'list' && renderListMode()}
    </div>
  )

  function renderReviewMode() {
    if (!isLoaded) return <div className="loading-screen"><div className="loading-text">加载中...</div></div>

    if (sessionDone) {
      const accuracy = sessionTotal > 0 ? Math.round((sessionCorrect / sessionTotal) * 100) : 0
      return (
        <div className="sr-summary">
          <CheckCircle2 size={48} style={{ color: '#22c55e', marginBottom: '1rem' }} />
          <h2>复习完成!</h2>
          <div className="sr-summary-stats">
            <div className="sr-summary-stat">
              <span className="sr-summary-value">{sessionTotal}</span>
              <span className="sr-summary-label">本次复习</span>
            </div>
            <div className="sr-summary-stat">
              <span className="sr-summary-value">{sessionCorrect}</span>
              <span className="sr-summary-label">正确</span>
            </div>
            <div className="sr-summary-stat">
              <span className="sr-summary-value">{accuracy}%</span>
              <span className="sr-summary-label">正确率</span>
            </div>
          </div>
          <button className="sr-start-btn" onClick={startNewSession}>
            {stats.due > 0 ? '继续复习' : '没有更多待复习卡片'}
          </button>
        </div>
      )
    }

    if (dueCards.length === 0 && !sessionDone) {
      return (
        <div className="sr-summary">
          <CheckCircle2 size={48} style={{ color: '#22c55e', marginBottom: '1rem' }} />
          <h2>暂无待复习卡片</h2>
          <p className="sr-summary-desc">
            {stats.total === 0
              ? '在文档阅读页点击"概念"按钮提取概念卡片后，即可开始间隔复习。'
              : '所有卡片都已复习完毕，稍后再来看看吧。'}
          </p>
          <button className="sr-start-btn" onClick={startNewSession}>刷新</button>
        </div>
      )
    }

    return (
      <div className="sr-card-area">
        <div className="sr-card-counter">{currentIdx + 1} / {dueCards.length}</div>
        <div
          className={`sr-card ${flipped ? 'flipped' : ''} ${slidingOut ? 'slide-out' : ''}`}
          onClick={handleFlip}
        >
          <div className="sr-card-inner">
            <div className="sr-card-front">
              <div className="sr-card-doc">
                <span className="sr-card-doc-icon">?</span>
                {getDocTitle(currentCard?.sourceDocId)}
              </div>
              <div className="sr-card-text">{currentCard?.conceptName}</div>
              <div className="sr-card-hint">点击翻转</div>
            </div>
            <div className="sr-card-back">
              <div className="sr-card-back-header">
                <div className="sr-card-doc">
                  <span className="sr-card-doc-icon">Q</span>
                  {currentCard?.conceptName}
                </div>
              </div>
              <div className="sr-card-text">{currentCard?.definition}</div>
              {currentCard?.examples && currentCard.examples.length > 0 && (
                <div className="sr-card-examples">
                  {currentCard.examples.map((ex, i) => (
                    <div key={i} className="sr-card-example">{ex}</div>
                  ))}
                </div>
              )}
              {currentCard?.relatedConcepts && currentCard.relatedConcepts.length > 0 && (
                <div className="sr-card-label">
                  相关: {currentCard.relatedConcepts.join('、')}
                </div>
              )}
            </div>
          </div>
        </div>

        {flipped && (
          <div className="sr-grade-buttons">
            {GRADES.map(g => (
              <button
                key={g.grade}
                className="sr-grade-btn"
                style={{ '--grade-color': g.color } as React.CSSProperties}
                onClick={e => { e.stopPropagation(); handleGrade(g.grade) }}
              >
                <span className="sr-grade-key">{g.grade}</span>
                <span className="sr-grade-label">{g.label}</span>
              </button>
            ))}
          </div>
        )}

        {!flipped && (
          <div className="sr-actions">
            <button className="sr-skip-btn" onClick={handleSkip}>
              跳过 (S)
            </button>
          </div>
        )}
      </div>
    )
  }

  function renderListMode() {
    if (!isLoaded) return <div className="loading-screen"><div className="loading-text">加载中...</div></div>
    if (workspaceCards.length === 0) {
      return (
        <div className="sr-summary">
          <Lightbulb size={48} style={{ color: 'var(--text-dim)', marginBottom: '1rem' }} />
          <h2>暂无概念卡片</h2>
          <p className="sr-summary-desc">在文档阅读页点击"概念"按钮提取概念卡片后，即可开始间隔复习。</p>
        </div>
      )
    }

    if (filteredCards.length === 0) {
      return (
        <div className="sr-summary">
          <Search size={48} style={{ color: 'var(--text-dim)', marginBottom: '1rem' }} />
          <h2>无匹配结果</h2>
          <p className="sr-summary-desc">没有找到与"{searchQuery}"匹配的概念卡片</p>
        </div>
      )
    }

    const now = Date.now()
    const dueList = filteredCards.filter(c => c.nextReview <= now)
    const familiarList = filteredCards.filter(c => c.nextReview > now)

    return (
      <div className="sr-card-list">
        {dueList.length > 0 && (
          <div className="sr-list-section">
            <h3 className="sr-list-title">
              <Clock size={16} />
              待复习 ({dueList.length})
            </h3>
            {dueList.map(c => <CardItem key={c.id} card={c} onRemove={removeCard} />)}
          </div>
        )}
        {familiarList.length > 0 && (
          <div className="sr-list-section">
            <h3 className="sr-list-title">
              <CheckCircle2 size={16} />
              熟悉 ({familiarList.length})
            </h3>
            {familiarList.map(c => <CardItem key={c.id} card={c} onRemove={removeCard} />)}
          </div>
        )}
      </div>
    )
  }

  function getDocTitle(docId?: string): string {
    if (!docId) return ''
    const doc = documents.get(docId)
    return doc?.title || '未知文档'
  }
}

function CardItem({ card, onRemove }: { card: ConceptCard; onRemove: (id: string) => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const documents = useDocumentStore(s => s.documents)
  const docTitle = card.sourceDocId ? (documents.get(card.sourceDocId)?.title || '未知文档') : '未知文档'

  const now = Date.now()
  const isDue = card.nextReview <= now
  const status = card.lastReview === 0 ? 'new' : card.interval >= 21 ? 'mastered' : card.interval >= 1 ? 'learning' : 'due'
  const statusLabel = status === 'new' ? '新卡片' : status === 'mastered' ? '已掌握' : status === 'learning' ? `${card.interval}天后` : '待复习'
  const statusColor = status === 'new' ? '#22c55e' : status === 'mastered' ? '#a855f7' : status === 'learning' ? '#3b82f6' : '#ef4444'

  return (
    <div className="sr-list-item">
      <div className="sr-list-item-color" style={{ background: statusColor }} />
      <div className="sr-list-item-content">
        <div className="sr-list-item-front">{card.conceptName}</div>
        {card.definition && (
          <div className="sr-list-item-definition">{card.definition}</div>
        )}
        <div className="sr-list-item-meta">
          <span className={`sr-list-item-status ${status}`}>{statusLabel}</span>
          <Link to={`/doc/${card.sourceDocId}`} className="sr-list-item-doc" onClick={e => e.stopPropagation()}>
            <BookOpen size={12} />
            {docTitle}
          </Link>
        </div>
      </div>
      <div className="sr-list-item-actions">
        {confirmDelete ? (
          <button className="sr-list-confirm-delete" onClick={() => onRemove(card.id)}>
            确认删除
          </button>
        ) : (
          <button className="sr-list-delete-btn" onClick={() => setConfirmDelete(true)} title="删除卡片">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

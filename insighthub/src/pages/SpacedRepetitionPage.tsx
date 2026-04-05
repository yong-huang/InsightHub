import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Layers, RotateCcw, Trash2, BookOpen,
  Clock, CheckCircle2, AlertCircle, Star, Zap,
} from 'lucide-react'
import { useFlashcardStore } from '@/stores/flashcardStore'
import { useAnnotationStore } from '@/stores/annotationStore'
import { useDocumentStore } from '@/stores/documentStore'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { getCardStats, getDueCards, stripHtml } from '@/services/spacedRepetition'
import type { Flashcard } from '@/types'

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
  const { cards, isLoaded, loadCards, generateCardsFromAnnotations, reviewCard, removeCard, skipCard } = useFlashcardStore()
  const annotations = useAnnotationStore(s => s.annotations)
  const documents = useDocumentStore(s => s.documents)
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)

  // Filter cards by current workspace
  const workspaceCards = useMemo(() =>
    cards.filter(c => documents.get(c.documentId)?.source === activeWorkspace),
    [cards, documents, activeWorkspace]
  )

  const [viewMode, setViewMode] = useState<ViewMode>('review')
  const [flipped, setFlipped] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [sessionResults, setSessionResults] = useState<{ cardId: string; grade: number }[]>([])
  const [sessionDone, setSessionDone] = useState(false)
  const [slidingOut, setSlidingOut] = useState(false)

  // Load cards on mount
  useEffect(() => {
    if (!isLoaded) loadCards()
  }, [isLoaded, loadCards])

  // Auto-generate cards from annotations in current workspace
  const workspaceAnnotations = useMemo(() =>
    annotations.filter(a => documents.get(a.documentId)?.source === activeWorkspace),
    [annotations, documents, activeWorkspace]
  )

  useEffect(() => {
    if (isLoaded && workspaceAnnotations.length > 0) {
      const getDocTitle = (docId: string) => documents.get(docId)?.title
      generateCardsFromAnnotations(workspaceAnnotations, getDocTitle)
    }
  }, [isLoaded, workspaceAnnotations.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const dueCards = useMemo(() => getDueCards(workspaceCards), [workspaceCards])
  const stats = useMemo(() => getCardStats(workspaceCards), [workspaceCards])

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

  // Keyboard shortcuts
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
      <div className="page-header">
        <div className="page-header-left">
          <Layers size={24} />
          <h1>间隔复习</h1>
        </div>
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
            <Layers size={16} />
            全部卡片
          </button>
        </div>
      </div>

      {/* Stats bar */}
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

      {/* Progress bar */}
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

    // Session completed
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

    // No due cards
    if (dueCards.length === 0 && !sessionDone) {
      return (
        <div className="sr-summary">
          <CheckCircle2 size={48} style={{ color: '#22c55e', marginBottom: '1rem' }} />
          <h2>暂无待复习卡片</h2>
          <p className="sr-summary-desc">
            {stats.total === 0
              ? '阅读文档时添加高亮或批注，系统会自动生成复习卡片。'
              : '所有卡片都已复习完毕，稍后再来看看吧。'}
          </p>
          <button className="sr-start-btn" onClick={startNewSession}>刷新</button>
        </div>
      )
    }

    // Active review session
    return (
      <div className="sr-card-area">
        <div className="sr-card-counter">{currentIdx + 1} / {dueCards.length}</div>
        <div
          className={`sr-card ${flipped ? 'flipped' : ''} ${slidingOut ? 'slide-out' : ''}`}
          onClick={handleFlip}
        >
          <div className="sr-card-inner">
            <div className="sr-card-front">
              <div className="sr-card-doc">{currentCard?.documentTitle}</div>
              <div className="sr-card-text">{currentCard ? stripHtml(currentCard.front) : ''}</div>
              <div className="sr-card-hint">点击翻转 · 空格键</div>
            </div>
            <div className="sr-card-back">
              <div className="sr-card-doc">{currentCard?.documentTitle}</div>
              <div className="sr-card-text">{currentCard ? stripHtml(currentCard.back) : ''}</div>
              {currentCard?.type === 'comment' && (
                <div className="sr-card-label" style={{ borderLeftColor: currentCard.color }}>
                  {currentCard.type === 'comment' ? '批注' : '高亮'}
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
          <Layers size={48} style={{ color: 'var(--text-dim)', marginBottom: '1rem' }} />
          <h2>暂无卡片</h2>
          <p className="sr-summary-desc">阅读文档时添加高亮或批注，系统会自动生成复习卡片。</p>
        </div>
      )
    }

    const now = Date.now()
    const dueList = workspaceCards.filter(c => c.nextReview <= now)
    const familiarList = workspaceCards.filter(c => c.nextReview > now)

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
}

function CardItem({ card, onRemove }: { card: Flashcard; onRemove: (id: string) => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className={`sr-list-item ${card.sourceDeleted ? 'sr-list-item-deleted' : ''}`}>
      <div className="sr-list-item-color" style={{ background: card.color }} />
      <div className="sr-list-item-content">
        <div className="sr-list-item-front">
          {stripHtml(card.front).replace(/\n/g, ' ')}
          {card.sourceDeleted && <span className="sr-list-item-deleted-tag">来源已删除</span>}
        </div>
        <div className="sr-list-item-meta">
          <span className="sr-list-item-type">{card.type === 'comment' ? '批注' : '高亮'}</span>
          <span className="sr-list-item-interval">
            {card.interval === 0 ? '新卡片' : card.interval >= 21 ? '已掌握' : `${card.interval}天后`}
          </span>
          {!card.sourceDeleted && (
            <Link to={`/doc/${card.documentId}`} className="sr-list-item-doc" onClick={e => e.stopPropagation()}>
              <BookOpen size={12} />
              {card.documentTitle}
            </Link>
          )}
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

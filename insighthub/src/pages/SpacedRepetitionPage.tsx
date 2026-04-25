import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Lightbulb, RotateCcw, Trash2, BookOpen,
  Clock, CheckCircle2, AlertCircle, Star, Zap, Search,
} from 'lucide-react'
import { useConceptCardStore } from '@/stores/conceptCardStore'
import { useDocumentStore } from '@/stores/documentStore'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { getPrefix } from '@/utils/workspaceUtils'
import type { ConceptCard } from '@/types'

type ViewMode = 'review' | 'list'

const GRADES = [
  { grade: 0, label: 'Forgot', color: '#ef4444' },
  { grade: 1, label: 'Hard', color: '#f97316' },
  { grade: 2, label: 'Difficult', color: '#eab308' },
  { grade: 3, label: 'Hesitant', color: '#22c55e' },
  { grade: 4, label: 'Easy', color: '#10b981' },
  { grade: 5, label: 'Simple', color: '#14b8a6' },
] as const

function formatInterval(ms: number): string {
  const diff = ms - Date.now()
  if (diff <= 0) return 'Due now'
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days < 30) return `${days}d`
  return `${Math.floor(days / 30)}mo`
}

export function SpacedRepetitionPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const filterDocId = searchParams.get('docId') || undefined
  const { cards, isLoaded, loadCards, reviewCard, removeCard, skipCard } = useConceptCardStore()
  const documents = useDocumentStore(s => s.documents)
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const workspaces = usePreferenceStore(s => s.workspaces)

  const showGuide = !filterDocId

  const workspaceCards = useMemo(() =>
    cards.filter(c => {
      if (!c.conceptName || !c.definition) return false
      if (filterDocId && c.sourceDocId !== filterDocId) return false
      const doc = documents.get(c.sourceDocId)
      return doc?.source === activeWorkspace || c.sourceDocId.startsWith(getPrefix(activeWorkspace, workspaces) || 'ti-')
    }),
    [cards, documents, activeWorkspace, filterDocId]
  )

  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>(filterDocId ? 'review' : 'review')
  const [flipped, setFlipped] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [page, setPage] = useState(1)
  const [sessionQueue, setSessionQueue] = useState<ConceptCard[]>([])
  const PAGE_SIZE = 30

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

  useEffect(() => {
    setPage(1)
    if (searchQuery.trim()) setViewMode('list')
  }, [searchQuery, viewMode])

  const [sessionResults, setSessionResults] = useState<{ cardId: string; grade: number }[]>([])
  const [sessionDone, setSessionDone] = useState(false)
  const [slidingOut, setSlidingOut] = useState(false)

  useEffect(() => {
    if (!isLoaded) loadCards()
    if (isLoaded) {
      const empty = cards.filter(c => !c.conceptName || !c.definition)
      for (const c of empty) removeCard(c.id)
    }
  }, [isLoaded, loadCards, cards, removeCard])

  const dueCards = useMemo(() => {
    const now = Date.now()
    return filteredCards
      .filter(c => c.nextReview <= now)
      .sort((a, b) => a.nextReview - b.nextReview)
  }, [filteredCards])

  useEffect(() => {
    if (isLoaded && sessionQueue.length === 0 && dueCards.length > 0) {
      setSessionQueue(dueCards)
    }
  }, [isLoaded, dueCards, sessionQueue.length])

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

  const currentCard = sessionQueue[currentIdx] ?? null

  const handleGrade = useCallback((grade: number) => {
    if (!currentCard) return
    setSlidingOut(true)
    setTimeout(() => {
      reviewCard(currentCard.id, grade)
      setSessionResults(prev => [...prev, { cardId: currentCard.id, grade }])
      setFlipped(false)
      setSlidingOut(false)
      if (currentIdx + 1 >= sessionQueue.length) {
        setSessionDone(true)
      } else {
        setCurrentIdx(i => i + 1)
      }
    }, 200)
  }, [currentCard, currentIdx, sessionQueue.length, reviewCard])

  const handleFlip = useCallback(() => {
    if (!currentCard) return
    setFlipped(f => !f)
  }, [currentCard])

  const handleSkip = useCallback(() => {
    if (!currentCard) return
    skipCard(currentCard.id)
    setFlipped(false)
    if (currentIdx + 1 >= sessionQueue.length) {
      setSessionDone(true)
    } else {
      setCurrentIdx(i => i + 1)
    }
  }, [currentCard, currentIdx, sessionQueue.length, skipCard])

  const startNewSession = useCallback(() => {
    setCurrentIdx(0)
    setFlipped(false)
    setSessionResults([])
    setSessionDone(false)
    const now = Date.now()
    const queue = filteredCards
      .filter(c => c.nextReview <= now)
      .sort((a, b) => a.nextReview - b.nextReview)
    setSessionQueue(queue)
  }, [filteredCards])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (sessionDone || viewMode !== 'review') return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
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

  // Guide prompt when accessed directly without docId
  if (showGuide) {
    return (
      <div className="cs-settings">
        <div className="cs-settings-header">
          <div className="cs-section-label">SPACED REPETITION</div>
          <h1>Concept Card Review</h1>
          <p className="cs-settings-subtitle">Reinforce core concepts extracted by AI from documents through spaced repetition.</p>
        </div>
        <div className="cs-card">
          <div className="cs-card-body">
            <div className="cs-empty-hint">
              <Lightbulb size={32} style={{ opacity: 0.3, marginBottom: '0.5rem', display: 'block' }} />
              Open any document and click the "Concepts" button in the toolbar to start reviewing.
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="cs-settings">
      {/* Page header */}
      <div className="cs-settings-header">
        <div className="cs-section-label">SPACED REPETITION</div>
        <h1>
          Concept Cards
          {filterDocId && (
            <span style={{ fontSize: '0.8em', color: 'var(--text-secondary)', marginLeft: '0.5rem', fontWeight: 400 }}>
              — {documents.get(filterDocId)?.title || 'Unknown Document'}
            </span>
          )}
        </h1>
        <p className="cs-settings-subtitle">
          Reinforce core concepts extracted by AI from documents through spaced repetition.
        </p>
      </div>

      {/* Stats card */}
      <div className="cs-card">
        <div className="cs-card-header">OVERVIEW</div>
        <div className="cs-card-body">
          <div className="cs-sr-stats">
            <div className="cs-sr-stat">
              <div className="cs-sr-stat-icon" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                <Clock size={18} />
              </div>
              <div className="cs-sr-stat-value">{stats.due}</div>
              <div className="cs-sr-stat-label">Due</div>
            </div>
            <div className="cs-sr-stat">
              <div className="cs-sr-stat-icon" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                <Zap size={18} />
              </div>
              <div className="cs-sr-stat-value">{stats.new}</div>
              <div className="cs-sr-stat-label">New</div>
            </div>
            <div className="cs-sr-stat">
              <div className="cs-sr-stat-icon" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
                <AlertCircle size={18} />
              </div>
              <div className="cs-sr-stat-value">{stats.learning}</div>
              <div className="cs-sr-stat-label">Learning</div>
            </div>
            <div className="cs-sr-stat">
              <div className="cs-sr-stat-icon" style={{ background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}>
                <Star size={18} />
              </div>
              <div className="cs-sr-stat-value">{stats.mastered}</div>
              <div className="cs-sr-stat-label">Mastered</div>
            </div>
          </div>

          {/* View toggle + search */}
          {workspaceCards.length > 0 && (
            <div className="cs-sr-toolbar">
              <div className="cs-btn-group">
                <button
                  className={`cs-btn ${viewMode === 'review' ? 'cs-btn-primary' : 'cs-btn-secondary'}`}
                  onClick={() => setViewMode('review')}
                >
                  <RotateCcw size={14} /> Review
                </button>
                <button
                  className={`cs-btn ${viewMode === 'list' ? 'cs-btn-primary' : 'cs-btn-secondary'}`}
                  onClick={() => setViewMode('list')}
                >
                  <Lightbulb size={14} /> All Cards
                </button>
              </div>
              <div className="cs-search-wrap">
                <Search size={14} />
                <input
                  type="text"
                  className="cs-search-input"
                  placeholder="Search concept cards..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Session progress */}
          {viewMode === 'review' && sessionTotal > 0 && (
            <div className="cs-sr-progress">
              <div className="cs-progress-bar">
                <div
                  className="cs-progress-fill"
                  style={{ width: `${Math.round((sessionCorrect / sessionTotal) * 100)}%`, background: 'var(--accent-green)' }}
                />
              </div>
              <span className="cs-sr-progress-text">{sessionCorrect}/{sessionTotal} Correct</span>
            </div>
          )}

          {/* Mode content */}
          {viewMode === 'review' && renderReviewMode()}
          {viewMode === 'list' && renderListMode()}
        </div>
      </div>
    </div>
  )

  function renderReviewMode() {
    if (!isLoaded) return <div className="cs-empty-hint">Loading...</div>

    if (sessionDone) {
      const accuracy = sessionTotal > 0 ? Math.round((sessionCorrect / sessionTotal) * 100) : 0
      return (
        <div className="cs-sr-summary">
          <CheckCircle2 size={40} style={{ color: 'var(--accent-green)', marginBottom: '0.75rem' }} />
          <h2 style={{ margin: 0 }}>Review Complete!</h2>
          <div className="cs-sr-summary-stats">
            <div className="cs-sr-summary-stat">
              <span className="cs-sr-summary-value">{sessionTotal}</span>
              <span className="cs-sr-summary-label">This Session</span>
            </div>
            <div className="cs-sr-summary-stat">
              <span className="cs-sr-summary-value">{sessionCorrect}</span>
              <span className="cs-sr-summary-label">Correct</span>
            </div>
            <div className="cs-sr-summary-stat">
              <span className="cs-sr-summary-value">{accuracy}%</span>
              <span className="cs-sr-summary-label">Accuracy</span>
            </div>
          </div>
          <button className="cs-btn cs-btn-primary" onClick={startNewSession}>
            {stats.due > 0 ? 'Continue Review' : 'No more cards to review'}
          </button>
        </div>
      )
    }

    if (sessionQueue.length === 0 && !sessionDone) {
      return (
        <div className="cs-sr-summary">
          <CheckCircle2 size={40} style={{ color: 'var(--accent-green)', marginBottom: '0.75rem' }} />
          <h2 style={{ margin: 0 }}>No Cards Due for Review</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0.5rem 0' }}>
            {stats.total === 0
              ? 'Extract concept cards by clicking the "Concepts" button on the document page to start spaced review.'
              : 'All cards have been reviewed. Check back later.'}
          </p>
          <button className="cs-btn cs-btn-primary" onClick={startNewSession}>Refresh</button>
        </div>
      )
    }

    return (
      <div className="cs-sr-card-area">
        <div className="cs-sr-card-counter">{currentIdx + 1} / {sessionQueue.length}</div>
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
              <div className="sr-card-hint">Click to flip</div>
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
                  Related: {currentCard.relatedConcepts.join(', ')}
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
          <div className="cs-sr-actions">
            <button className="cs-btn cs-btn-ghost" onClick={handleSkip}>
              Skip (S)
            </button>
          </div>
        )}
      </div>
    )
  }

  function renderListMode() {
    if (!isLoaded) return <div className="cs-empty-hint">Loading...</div>
    if (workspaceCards.length === 0) {
      return (
        <div className="cs-sr-summary">
          <Lightbulb size={40} style={{ color: 'var(--text-dim)', marginBottom: '0.75rem' }} />
          <h2 style={{ margin: 0 }}>No Concept Cards</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0.5rem 0' }}>
            Extract concept cards by clicking the "Concepts" button on the document page to start spaced review.
          </p>
        </div>
      )
    }

    if (filteredCards.length === 0) {
      return (
        <div className="cs-sr-summary">
          <Search size={40} style={{ color: 'var(--text-dim)', marginBottom: '0.75rem' }} />
          <h2 style={{ margin: 0 }}>No Matching Results</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0.5rem 0' }}>
            No concept cards matching "{searchQuery}"
          </p>
        </div>
      )
    }

    const now = Date.now()
    const dueList = filteredCards.filter(c => c.nextReview <= now)
    const familiarList = filteredCards.filter(c => c.nextReview > now)
    const allList = [...dueList, ...familiarList]
    const totalPages = Math.ceil(allList.length / PAGE_SIZE)
    const safePage = Math.min(page, totalPages) || 1
    const pagedList = allList.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
    const pagedDue = pagedList.filter(c => c.nextReview <= now)
    const pagedFamiliar = pagedList.filter(c => c.nextReview > now)

    const startIdx = allList.length > 0 ? (safePage - 1) * PAGE_SIZE + 1 : 0
    const endIdx = Math.min(safePage * PAGE_SIZE, allList.length)

    return (
      <>
        {pagedDue.length > 0 && (
          <div className="cs-sr-list-section">
            <div className="cs-sr-list-title">
              <Clock size={14} /> Due ({dueList.length})
            </div>
            <div className="cs-item-list">
              {pagedDue.map(c => <CardItem key={c.id} card={c} onRemove={removeCard} />)}
            </div>
          </div>
        )}
        {pagedFamiliar.length > 0 && (
          <div className="cs-sr-list-section">
            <div className="cs-sr-list-title">
              <CheckCircle2 size={14} /> Familiar ({familiarList.length})
            </div>
            <div className="cs-item-list">
              {pagedFamiliar.map(c => <CardItem key={c.id} card={c} onRemove={removeCard} />)}
            </div>
          </div>
        )}
        {totalPages > 1 && (
          <div className="cs-pagination">
            <span className="cs-pagination-info">{startIdx}–{endIdx} of {allList.length}</span>
            <div className="cs-pagination-btns">
              <button className="cs-btn cs-btn-ghost" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
                Prev
              </button>
              <span className="cs-pagination-page">{safePage} / {totalPages}</span>
              <button className="cs-btn cs-btn-ghost" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>
                Next
              </button>
            </div>
          </div>
        )}
      </>
    )
  }

  function getDocTitle(docId?: string): string {
    if (!docId) return ''
    const doc = documents.get(docId)
    return doc?.title || 'Unknown Document'
  }
}

const CardItem = memo(function CardItem({ card, onRemove }: { card: ConceptCard; onRemove: (id: string) => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const documents = useDocumentStore(s => s.documents)
  const docTitle = card.sourceDocId ? (documents.get(card.sourceDocId)?.title || 'Unknown Document') : 'Unknown Document'

  const now = Date.now()
  const status = card.lastReview === 0 ? 'new' : card.interval >= 21 ? 'mastered' : card.interval >= 1 ? 'learning' : 'due'
  const statusLabel = status === 'new' ? 'New' : status === 'mastered' ? 'Mastered' : status === 'learning' ? formatInterval(card.nextReview) : 'Due'
  const statusColor = status === 'new' ? '#22c55e' : status === 'mastered' ? '#a855f7' : status === 'learning' ? '#3b82f6' : '#ef4444'

  return (
    <div className="cs-model-item" style={{ paddingLeft: 0 }}>
      <div className="cs-sr-list-color" style={{ background: statusColor }} />
      <div className="cs-model-info">
        <div className="cs-model-name">{card.conceptName}</div>
        <div className="cs-model-meta">
          <span className="cs-sr-list-status" style={{ color: statusColor }}>{statusLabel}</span>
          <Link to={`/doc/${card.sourceDocId}`} className="cs-sr-list-doc" onClick={e => e.stopPropagation()}>
            <BookOpen size={12} />
            {docTitle}
          </Link>
        </div>
        {card.definition && (
          <div className="cs-sr-list-def">{card.definition}</div>
        )}
      </div>
      <div className="cs-model-actions">
        {confirmDelete ? (
          <button className="cs-btn cs-btn-ghost" style={{ fontSize: '0.75rem', color: 'var(--accent-red)' }} onClick={() => onRemove(card.id)}>
            Delete
          </button>
        ) : (
          <button className="cs-btn cs-btn-ghost cs-sr-delete" onClick={() => setConfirmDelete(true)} title="Delete card">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
})

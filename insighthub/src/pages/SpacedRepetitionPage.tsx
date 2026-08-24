import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Lightbulb, RotateCcw, Trash2, BookOpen,
  Clock, CheckCircle2, AlertCircle, Star, Zap, ChevronLeft, Sparkles,
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
  const fromPath = searchParams.get('from') || undefined
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
      return doc?.source === activeWorkspace || c.sourceDocId.startsWith(getPrefix(activeWorkspace, workspaces) || '')
    }),
    [cards, documents, activeWorkspace, filterDocId, workspaces]
  )

  const [viewMode, setViewMode] = useState<ViewMode>('review')
  const [flipped, setFlipped] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [page, setPage] = useState(1)
  const [sessionQueue, setSessionQueue] = useState<ConceptCard[]>([])
  const PAGE_SIZE = 30

  const [sessionResults, setSessionResults] = useState<{ cardId: string; grade: number }[]>([])
  const [sessionDone, setSessionDone] = useState(false)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)

  // Load cards once on mount, clean up empty cards on initial load only
  useEffect(() => {
    if (!isLoaded) loadCards()
  }, [isLoaded, loadCards])
  useEffect(() => {
    if (!isLoaded) return
    const empty = cards.filter(c => !c.conceptName || !c.definition)
    if (empty.length === 0) return
    for (const c of empty) removeCard(c.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded])

  const dueCards = useMemo(() => {
    const now = Date.now()
    return workspaceCards
      .filter(c => c.nextReview <= now)
      .sort((a, b) => a.nextReview - b.nextReview)
  }, [workspaceCards])

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
    reviewCard(currentCard.id, grade)
    setSessionResults(prev => [...prev, { cardId: currentCard.id, grade }])
    setFlipped(false)
    if (currentIdx + 1 >= sessionQueue.length) {
      setSessionDone(true)
    } else {
      setCurrentIdx(i => i + 1)
    }
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
    const queue = workspaceCards
      .filter(c => c.nextReview <= now)
      .sort((a, b) => a.nextReview - b.nextReview)
    setSessionQueue(queue)
  }, [workspaceCards])

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

  // List mode
  if (viewMode === 'list') {
    const now = Date.now()
    const dueList = workspaceCards.filter(c => c.nextReview <= now)
    const familiarList = workspaceCards.filter(c => c.nextReview > now)
    const allList = [...dueList, ...familiarList]
    const totalPages = Math.ceil(allList.length / PAGE_SIZE)
    const safePage = Math.min(page, totalPages) || 1
    const pagedList = allList.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
    const pagedDue = pagedList.filter(c => c.nextReview <= now)
    const pagedFamiliar = pagedList.filter(c => c.nextReview > now)

    const startIdx = allList.length > 0 ? (safePage - 1) * PAGE_SIZE + 1 : 0
    const endIdx = Math.min(safePage * PAGE_SIZE, allList.length)

    return (
      <div className="cs-settings">
        <div className="cs-settings-header">
          <div className="cs-section-label">CONCEPT CARDS</div>
          <h1>
            {documents.get(filterDocId || '')?.title || 'Concept Cards'}
          </h1>
          <p className="cs-settings-subtitle">{workspaceCards.length} cards total</p>
        </div>

        {/* Stats */}
        <div className="cs-card" style={{ marginBottom: '1rem' }}>
          <div className="cs-card-body" style={{ padding: '0.75rem 1rem' }}>
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
          </div>
        </div>

        {/* Toolbar */}
        <div className="cs-btn-group" style={{ marginBottom: '1.25rem' }}>
          <button
            className="cs-btn cs-btn-secondary"
            onClick={() => setViewMode('review')}
          >
            <RotateCcw size={14} /> Review
          </button>
          <button
            className="cs-btn cs-btn-primary"
            onClick={() => setViewMode('list')}
          >
            <Lightbulb size={14} /> All Cards
          </button>
          {filterDocId && workspaceCards.length > 0 && (confirmDeleteAll ? (
            <span style={{ fontSize: '0.75rem', color: 'var(--accent-red)', whiteSpace: 'nowrap' }}>
              Delete {workspaceCards.length} card(s)?
              <button className="cs-btn cs-btn-ghost" style={{ fontSize: '0.75rem', marginLeft: '0.25rem' }} onClick={() => { for (const c of workspaceCards) removeCard(c.id); setConfirmDeleteAll(false); navigate(`/doc/${filterDocId}`, { state: { from: fromPath || undefined } }) }}>Yes</button>
              <button className="cs-btn cs-btn-ghost" style={{ fontSize: '0.75rem', marginLeft: '0.125rem' }} onClick={() => setConfirmDeleteAll(false)}>No</button>
            </span>
          ) : (
            <button
              className="cs-btn cs-btn-secondary"
              style={{ marginLeft: 'auto', color: 'var(--accent-red)' }}
              onClick={() => setConfirmDeleteAll(true)}
            >
              <Trash2 size={14} /> Delete
            </button>
          ))}
        </div>

        {!isLoaded ? (
          <div className="cs-card">
            <div className="cs-card-body"><div className="cs-empty-hint">Loading...</div></div>
          </div>
        ) : workspaceCards.length === 0 ? (
          <div className="cs-card">
            <div className="cs-card-body">
              <div className="cs-sr-summary">
                <Lightbulb size={40} style={{ color: 'var(--text-dim)', marginBottom: '0.75rem' }} />
                <h2 style={{ margin: 0 }}>No Concept Cards</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0.5rem 0' }}>
                  Extract concept cards from the document page to start spaced review.
                </p>
              </div>
            </div>
          </div>
        ) : (
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
        )}
      </div>
    )
  }

  // Review mode — session done scoreboard
  if (sessionDone) {
    const accuracy = sessionTotal > 0 ? Math.round((sessionCorrect / sessionTotal) * 100) : 0
    return (
      <div className="cs-settings">
        <div className="cs-settings-header">
          <div className="cs-section-label">REVIEW RESULT</div>
          <h1>{accuracy >= 60 ? 'Well Done!' : 'Keep Practicing'}</h1>
          <p className="cs-settings-subtitle">{sessionCorrect} / {sessionTotal} correct ({accuracy}%)</p>
        </div>

        <div className="cs-card">
          <div className="cs-card-header" style={{ justifyContent: 'center' }}>
            <Star size={20} style={{ color: accuracy >= 60 ? 'var(--accent-yellow)' : 'var(--text-dim)' }} />
            <span style={{ marginLeft: '0.5rem' }}>REVIEW COMPLETE</span>
          </div>
          <div className="cs-card-body">
            <div style={{ display: 'grid', gap: '1rem' }}>
              {sessionResults.map((r, i) => {
                const card = sessionQueue[i]
                if (!card) return null
                const gradeInfo = GRADES.find(g => g.grade === r.grade) || GRADES[0]
                return (
                  <div key={`${r.cardId}-${i}`} style={{
                    padding: '1rem',
                    background: 'var(--bg-input)',
                    borderRadius: 'var(--radius-md)',
                    borderLeft: `3px solid ${gradeInfo.color}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <span className={`cs-badge ${r.grade >= 3 ? 'cs-badge-green' : 'cs-badge-red'}`}>
                        {i + 1}
                      </span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, marginLeft: 'auto', color: gradeInfo.color }}>
                        {gradeInfo.label}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>{card.conceptName}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{card.definition}</div>
                  </div>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1.5rem' }}>
              <button className="cs-btn cs-btn-primary" onClick={startNewSession}>
                <RotateCcw size={14} /> Review Again
              </button>
              <Link to={filterDocId ? `/doc/${filterDocId}` : '/'} state={{ from: fromPath || undefined }} className="cs-btn cs-btn-secondary">
                <ChevronLeft size={14} /> Back
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Review mode — no due cards
  if (sessionQueue.length === 0) {
    return (
      <div className="cs-settings">
        <div className="cs-settings-header">
          <div className="cs-section-label">CONCEPT CARDS</div>
          <h1>{documents.get(filterDocId || '')?.title || 'Concept Cards'}</h1>
        </div>
        <div className="cs-card">
          <div className="cs-card-body" style={{ padding: '0.75rem 1rem' }}>
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
          </div>
        </div>
        <div className="cs-btn-group" style={{ marginBottom: '1.25rem' }}>
          <Link
            to={filterDocId ? `/doc/${filterDocId}` : '/'}
            state={{ from: fromPath || undefined }}
            className="cs-btn cs-btn-secondary"
          >
            <ChevronLeft size={14} /> Back
          </Link>
          <button className="cs-btn cs-btn-primary">
            <RotateCcw size={14} /> Review
          </button>
          <button className="cs-btn cs-btn-secondary" onClick={() => setViewMode('list')}>
            <Lightbulb size={14} /> All Cards
          </button>
          {filterDocId && workspaceCards.length > 0 && (confirmDeleteAll ? (
            <span style={{ fontSize: '0.75rem', color: 'var(--accent-red)', whiteSpace: 'nowrap' }}>
              Delete {workspaceCards.length} card(s)?
              <button className="cs-btn cs-btn-ghost" style={{ fontSize: '0.75rem', marginLeft: '0.25rem' }} onClick={() => { for (const c of workspaceCards) removeCard(c.id); setConfirmDeleteAll(false); navigate(`/doc/${filterDocId}`, { state: { from: fromPath || undefined } }) }}>Yes</button>
              <button className="cs-btn cs-btn-ghost" style={{ fontSize: '0.75rem', marginLeft: '0.125rem' }} onClick={() => setConfirmDeleteAll(false)}>No</button>
            </span>
          ) : (
            <button
              className="cs-btn cs-btn-secondary"
              style={{ marginLeft: 'auto', color: 'var(--accent-red)' }}
              onClick={() => setConfirmDeleteAll(true)}
            >
              <Trash2 size={14} /> Delete
            </button>
          ))}
        </div>
        <div className="cs-card">
          <div className="cs-card-body">
            <div className="cs-sr-summary">
              <CheckCircle2 size={40} style={{ color: 'var(--accent-green)', marginBottom: '0.75rem' }} />
              <h2 style={{ margin: 0 }}>All Caught Up!</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0.5rem 0' }}>
                No cards due for review right now.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Review mode — active review
  return (
    <div className="cs-settings">
      <div className="cs-settings-header" style={{ marginBottom: '0.75rem' }}>
        <div className="cs-section-label">CONCEPT CARDS</div>
        <h1 style={{ fontSize: '1.25rem' }}>{documents.get(filterDocId || '')?.title || 'Concept Cards'}</h1>
      </div>

      {/* Progress bar */}
      <div className="cs-card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem' }}>
          <Link
            to={filterDocId ? `/doc/${filterDocId}` : '/'}
            state={{ from: fromPath || undefined }}
            className="cs-btn cs-btn-secondary"
            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
          >
            <ChevronLeft size={14} /> Exit
          </Link>
          {filterDocId && workspaceCards.length > 0 && (confirmDeleteAll ? (
            <span style={{ fontSize: '0.75rem', color: 'var(--accent-red)', whiteSpace: 'nowrap' }}>
              Delete {workspaceCards.length} card(s)?
              <button className="cs-btn cs-btn-ghost" style={{ fontSize: '0.75rem', marginLeft: '0.25rem' }} onClick={() => { for (const c of workspaceCards) removeCard(c.id); setConfirmDeleteAll(false); navigate(`/doc/${filterDocId}`, { state: { from: fromPath || undefined } }) }}>Yes</button>
              <button className="cs-btn cs-btn-ghost" style={{ fontSize: '0.75rem', marginLeft: '0.125rem' }} onClick={() => setConfirmDeleteAll(false)}>No</button>
            </span>
          ) : (
            <button
              className="cs-btn cs-btn-secondary"
              style={{ padding: '4px 10px', fontSize: '0.75rem', color: 'var(--accent-red)' }}
              onClick={() => setConfirmDeleteAll(true)}
            >
              <Trash2 size={14} /> Delete
            </button>
          ))}
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            {currentIdx + 1} / {sessionQueue.length}
          </span>
          <div style={{ flex: 1, height: '6px', background: 'var(--bg-input)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${((currentIdx + 1) / sessionQueue.length) * 100}%`, background: 'var(--accent-blue)', borderRadius: '3px', transition: 'width 0.3s' }} />
          </div>
        </div>
      </div>

      {/* Card navigation */}
      <div className="cs-card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '0.75rem 1rem' }}>
          {sessionQueue.map((c, i) => (
            <button
              key={c.id}
              className={`quiz-question-nav-item ${i === currentIdx ? 'current' : ''} ${i < currentIdx ? 'answered' : ''}`}
              onClick={() => setCurrentIdx(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Concept card */}
      <div className="question-card slide-in-right" key={currentCard?.id}>
        <div className="question-card-header">
          <span className="question-type-badge">Concept Card</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
            {currentIdx + 1} / {sessionQueue.length}
          </span>
        </div>

        <div className="question-text" style={{ cursor: 'pointer' }} onClick={handleFlip}>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{currentCard?.conceptName}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            {flipped
              ? (currentCard?.definition || 'No definition')
              : 'Click to reveal the definition'}
          </div>
        </div>

        {/* Source doc link */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.5rem 1rem', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
          <BookOpen size={12} />
          <Link
            to={`/doc/${currentCard?.sourceDocId}`}
            onClick={e => e.stopPropagation()}
            style={{ color: 'var(--text-dim)', textDecoration: 'none' }}
          >
            {currentCard?.sourceDocId ? (documents.get(currentCard.sourceDocId)?.title || 'Source Document') : 'Source Document'}
          </Link>
        </div>
      </div>

      {/* Grade / Skip buttons */}
      <div className="question-actions">
        <button className="cs-btn cs-btn-secondary" onClick={handleSkip}>
          <AlertCircle size={14} /> Skip (S)
        </button>
        {!flipped ? (
          <button className="cs-btn cs-btn-primary" onClick={handleFlip}>
            <Sparkles size={14} /> Flip (Space)
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {GRADES.map(g => (
              <button
                key={g.grade}
                className="cs-btn"
                style={{
                  background: `${g.color}20`,
                  color: g.color,
                  border: `1px solid ${g.color}40`,
                  minWidth: '56px',
                }}
                onClick={() => handleGrade(g.grade)}
              >
                {g.grade} · {g.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const CardItem = memo(function CardItem({ card, onRemove }: { card: ConceptCard; onRemove: (id: string) => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const documents = useDocumentStore(s => s.documents)
  const docTitle = card.sourceDocId ? (documents.get(card.sourceDocId)?.title || 'Unknown Document') : 'Unknown Document'

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

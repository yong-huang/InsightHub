import { useState, useRef, useCallback, useEffect } from 'react'
import { X, Send, Loader2, Swords, Trophy, ChevronRight, Trash2 } from 'lucide-react'
import type { ConceptChallenge, ChallengeRound } from '@/types'
import {
  startChallenge, evaluateResponse, generateNextChallenge, createChallenge,
} from '@/services/challengeService'
import { storageService } from '@/services/storageService'
import { useConceptCardStore } from '@/stores/conceptCardStore'

const MAX_ROUNDS = 5

interface ChallengePanelProps {
  documentId: string
  documentContent: string
  selectedText?: string
  onClose: () => void
  onSelectionUsed?: () => void
}

type Phase = 'setup' | 'challenging' | 'responding' | 'evaluating' | 'feedback' | 'complete'

interface SessionState {
  phase: Phase
  concept: string
  challenge: ConceptChallenge | null
  currentChallengeText: string
  userResponse: string
  currentScore: number
  currentFeedback: string
}

function loadSession(docId: string): SessionState | null {
  return storageService.getChallengeSession(docId) as SessionState | null
}

function saveSession(docId: string, state: SessionState) {
  storageService.saveChallengeSession(docId, state)
}

function clearSession(docId: string) {
  storageService.clearChallengeSession(docId)
}

export function ChallengePanel({
  documentId, documentContent, selectedText, onClose, onSelectionUsed,
}: ChallengePanelProps) {
  // Load persisted session once on mount (lazy initializer runs during first render only)
  const [saved] = useState(() => loadSession(documentId))
  const [phase, setPhase] = useState<Phase>(saved?.phase ?? 'setup')
  const [concept, setConcept] = useState(selectedText || (saved?.concept ?? ''))
  const [challenge, setChallenge] = useState<ConceptChallenge | null>(saved?.challenge ?? null)
  const [currentChallengeText, setCurrentChallengeText] = useState(saved?.currentChallengeText ?? '')
  const [streamingText, setStreamingText] = useState<string | null>(null)
  const [userResponse, setUserResponse] = useState(saved?.userResponse ?? '')
  const [currentScore, setCurrentScore] = useState(saved?.currentScore ?? 0)
  const [currentFeedback, setCurrentFeedback] = useState(saved?.currentFeedback ?? '')
  const [error, setError] = useState<string | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  const responseAreaRef = useRef<HTMLTextAreaElement>(null)
  const isComposingRef = useRef(false)

  const conceptCards = useConceptCardStore(s => s.cards)
  const suggestions = conceptCards
    .filter(c => c.sourceDocId === documentId)
    .slice(0, 5)

  const initialLoadRef = useRef(true)
  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false
      return
    }
    // Don't persist streaming/evaluating — those are transient
    if (phase === 'challenging' || phase === 'evaluating') return
    saveSession(documentId, { phase, concept, challenge, currentChallengeText, userResponse, currentScore, currentFeedback })
  }, [phase, concept, challenge, currentChallengeText, userResponse, currentScore, currentFeedback, documentId])

  // If restored session was in 'responding' phase, auto-focus textarea
  useEffect(() => {
    if (phase === 'responding' && saved?.phase === 'responding') {
      setTimeout(() => responseAreaRef.current?.focus(), 100)
    }
  }, [phase, saved])

  const handleStart = useCallback(async () => {
    if (!concept.trim()) return

    setError(null)
    onSelectionUsed?.()

    const ch = createChallenge(documentId, concept.trim())
    setChallenge(ch)
    setPhase('challenging')
    setStreamingText('')

    const controller = new AbortController()
    abortControllerRef.current = controller

    const result = await startChallenge(
      { concept: concept.trim(), docContent: documentContent, roundsSoFar: [] },
      (text) => setStreamingText(text),
      controller.signal,
    )

    abortControllerRef.current = null
    setStreamingText(null)

    if (result.success && result.data) {
      setCurrentChallengeText(String(result.data))
      setPhase('responding')
      setTimeout(() => responseAreaRef.current?.focus(), 100)
    } else if (!controller.signal.aborted) {
      setError(result.error || 'Failed to generate challenge')
      setPhase('setup')
    }
  }, [concept, documentId, documentContent, onSelectionUsed])

  const handleSubmitResponse = useCallback(async () => {
    if (!challenge || !userResponse.trim()) return

    setPhase('evaluating')

    const result = await evaluateResponse(
      challenge.concept,
      currentChallengeText,
      userResponse.trim(),
      documentContent,
    )

    if (result.nextChallenge) {
      setCurrentScore(result.score)
      setCurrentFeedback(result.feedback)
      setPhase('feedback')
    } else {
      const round: ChallengeRound = {
        id: `round-${Date.now()}`,
        challenge: currentChallengeText,
        userResponse: userResponse.trim(),
        feedback: result.feedback,
        score: result.score,
        timestamp: Date.now(),
      }
      const updatedChallenge: ConceptChallenge = {
        ...challenge,
        rounds: [...challenge.rounds, round],
        totalScore: Math.round([...challenge.rounds, round].reduce((sum, r) => sum + r.score, 0) / [...challenge.rounds, round].length),
        completedAt: Date.now(),
      }
      setChallenge(updatedChallenge)
      storageService.saveChallenge(updatedChallenge)
      setCurrentScore(result.score)
      setCurrentFeedback(result.feedback)
      setPhase('complete')
      clearSession(documentId)
    }
  }, [challenge, userResponse, currentChallengeText, documentContent, documentId])

  const handleNextRound = useCallback(async () => {
    if (!challenge) return

    const round: ChallengeRound = {
      id: `round-${Date.now()}`,
      challenge: currentChallengeText,
      userResponse: userResponse.trim(),
      feedback: currentFeedback,
      score: currentScore,
      timestamp: Date.now(),
    }
    const updatedRounds = [...challenge.rounds, round]

    if (updatedRounds.length >= MAX_ROUNDS) {
      const completedChallenge: ConceptChallenge = {
        ...challenge,
        rounds: updatedRounds,
        totalScore: Math.round(updatedRounds.reduce((sum, r) => sum + r.score, 0) / updatedRounds.length),
        completedAt: Date.now(),
      }
      setChallenge(completedChallenge)
      storageService.saveChallenge(completedChallenge)
      setPhase('complete')
      clearSession(documentId)
      return
    }

    setPhase('challenging')
    setStreamingText('')
    setUserResponse('')
    setError(null)

    const controller = new AbortController()
    abortControllerRef.current = controller

    const result = await generateNextChallenge(
      challenge.concept,
      updatedRounds,
      documentContent,
      (text) => setStreamingText(text),
      controller.signal,
    )

    abortControllerRef.current = null
    setStreamingText(null)

    if (result.success && result.data) {
      setCurrentChallengeText(String(result.data))
      setPhase('responding')
      setTimeout(() => responseAreaRef.current?.focus(), 100)
    } else if (!controller.signal.aborted) {
      const completedChallenge: ConceptChallenge = {
        ...challenge,
        rounds: updatedRounds,
        totalScore: Math.round(updatedRounds.reduce((sum, r) => sum + r.score, 0) / updatedRounds.length),
        completedAt: Date.now(),
      }
      setChallenge(completedChallenge)
      storageService.saveChallenge(completedChallenge)
      setPhase('complete')
      clearSession(documentId)
    }
  }, [challenge, currentChallengeText, userResponse, currentFeedback, currentScore, documentContent, documentId])

  const handleEnd = useCallback(() => {
    if (!challenge) return

    const round: ChallengeRound = {
      id: `round-${Date.now()}`,
      challenge: currentChallengeText,
      userResponse: userResponse.trim(),
      feedback: currentFeedback,
      score: currentScore,
      timestamp: Date.now(),
    }
    const updatedRounds = [...challenge.rounds, round]
    const completedChallenge: ConceptChallenge = {
      ...challenge,
      rounds: updatedRounds,
      totalScore: Math.round(updatedRounds.reduce((sum, r) => sum + r.score, 0) / updatedRounds.length),
      completedAt: Date.now(),
    }
    setChallenge(completedChallenge)
    storageService.saveChallenge(completedChallenge)
    setPhase('complete')
    clearSession(documentId)
  }, [challenge, currentChallengeText, userResponse, currentFeedback, currentScore, documentId])

  const handleReset = () => {
    clearSession(documentId)
    setPhase('setup')
    setChallenge(null)
    setCurrentChallengeText('')
    setStreamingText(null)
    setUserResponse('')
    setCurrentScore(0)
    setCurrentFeedback('')
    setError(null)
  }

  const scoreColor = currentScore >= 80 ? 'var(--accent-green)' : currentScore >= 50 ? 'var(--accent-yellow)' : 'var(--accent-red)'

  return (
    <div className="challenge-panel">
      {/* Header */}
      <div className="chat-panel-header">
        <h3>
          <Swords size={16} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '0.3rem' }} />
          Concept Challenge
        </h3>
        <div className="chat-panel-header-actions">
          <button className="chat-panel-action-btn" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Setup phase */}
      {phase === 'setup' && (
        <div className="challenge-setup">
          <label>CONCEPT TO CHALLENGE</label>
          <input
            type="text"
            value={concept}
            onChange={e => setConcept(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !isComposingRef.current) handleStart() }}
            onCompositionStart={() => { isComposingRef.current = true }}
            onCompositionEnd={() => { isComposingRef.current = false }}
            placeholder="Enter a concept or topic..."
          />
          <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
            The AI will challenge your understanding with counter-arguments, edge cases, and probing questions. Up to {MAX_ROUNDS} rounds.
          </p>
          {suggestions.length > 0 && (
            <div className="challenge-suggestions">
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Suggestions:</span>
              <div className="challenge-suggestion-chips">
                {suggestions.map(c => (
                  <button
                    key={c.id}
                    className="cs-btn cs-btn-ghost challenge-suggestion-chip"
                    onClick={() => setConcept(c.conceptName)}
                  >
                    {c.conceptName}
                  </button>
                ))}
              </div>
            </div>
          )}
          {error && <p style={{ fontSize: '0.8rem', color: 'var(--accent-red)' }}>{error}</p>}
          <button
            className="cs-btn cs-btn-primary"
            style={{ marginTop: 'auto', width: '100%' }}
            onClick={handleStart}
            disabled={!concept.trim()}
          >
            <Swords size={14} /> Start Challenge
          </button>
        </div>
      )}

      {/* Challenging phase (AI generating question) */}
      {phase === 'challenging' && (
        <div className="challenge-setup">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <label style={{ margin: 0 }}>ROUND {challenge ? challenge.rounds.length + 1 : 1}</label>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              {challenge?.concept}
            </span>
          </div>
          <div className="challenge-card">
            <div className="challenge-label">Devil's Advocate</div>
            <div className="challenge-text">
              {streamingText || <Loader2 size={14} className="spin" style={{ display: 'inline-flex' }} />}
            </div>
          </div>
          <button
            className="cs-btn cs-btn-ghost"
            style={{ marginTop: 'auto', width: '100%' }}
            onClick={() => { abortControllerRef.current?.abort(); setPhase('setup') }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Responding phase (user typing response) */}
      {phase === 'responding' && (
        <>
          <div className="challenge-card" style={{ margin: '0.75rem 1.25rem 0' }}>
            <div className="challenge-label">Round {challenge ? challenge.rounds.length + 1 : 1}</div>
            <div className="challenge-text">{currentChallengeText}</div>
          </div>
          <div className="challenge-response-area">
            <textarea
              ref={responseAreaRef}
              value={userResponse}
              onChange={e => setUserResponse(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) e.preventDefault() }}
              placeholder="Type your response..."
              rows={5}
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                className="cs-btn cs-btn-primary"
                style={{ flex: 1 }}
                onClick={handleSubmitResponse}
                disabled={!userResponse.trim()}
              >
                <Send size={14} /> Submit Response
              </button>
              <button
                className="cs-btn cs-btn-ghost"
                onClick={handleReset}
                title="Discard challenge"
                style={{ color: 'var(--accent-red)' }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Evaluating phase */}
      {phase === 'evaluating' && (
        <div className="challenge-setup" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <Loader2 size={24} className="spin" />
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Evaluating your response...</p>
        </div>
      )}

      {/* Feedback phase */}
      {phase === 'feedback' && (
        <>
          <div className="challenge-card" style={{ margin: '0.75rem 1.25rem 0' }}>
            <div className="challenge-label">Score</div>
            <div className="challenge-score-circle" style={{ background: `${scoreColor}20`, color: scoreColor }}>
              {currentScore}
            </div>
            <div className="challenge-feedback">{currentFeedback}</div>
          </div>
          <div style={{ padding: '0.75rem 1.25rem', display: 'flex', gap: '0.5rem' }}>
            <button
              className="cs-btn cs-btn-primary"
              style={{ flex: 1 }}
              onClick={handleNextRound}
            >
              <ChevronRight size={14} /> Next Challenge
            </button>
            <button
              className="cs-btn cs-btn-ghost"
              onClick={handleEnd}
            >
              End
            </button>
            <button
              className="cs-btn cs-btn-ghost"
              onClick={handleReset}
              title="Discard challenge"
              style={{ color: 'var(--accent-red)' }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </>
      )}

      {/* Complete phase — summary */}
      {phase === 'complete' && challenge && (
        <>
          <div style={{ padding: '1.25rem', textAlign: 'center' }}>
            <Trophy size={28} style={{ color: challenge.totalScore >= 70 ? 'var(--accent-yellow)' : 'var(--text-dim)' }} />
            <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '0.5rem' }}>
              Challenge Complete
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              {challenge.concept}
            </div>
            <div style={{
              fontSize: '1.8rem', fontWeight: 800, marginTop: '0.75rem',
              color: challenge.totalScore >= 80 ? 'var(--accent-green)' : challenge.totalScore >= 50 ? 'var(--accent-yellow)' : 'var(--accent-red)',
            }}>
              {challenge.totalScore}<span style={{ fontSize: '0.9rem', fontWeight: 400 }}>/100</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
              Average across {challenge.rounds.length} rounds
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--border-subtle)' }}>
            {challenge.rounds.map((round, i) => (
              <div key={round.id} className="challenge-round-item">
                <div className="challenge-round-header">
                  <span style={{ fontWeight: 600 }}>Round {i + 1}</span>
                  <span style={{
                    fontWeight: 700,
                    color: round.score >= 80 ? 'var(--accent-green)' : round.score >= 50 ? 'var(--accent-yellow)' : 'var(--accent-red)',
                  }}>
                    {round.score}/100
                  </span>
                </div>
                <div className="challenge-round-challenge">{round.challenge}</div>
                <div className="challenge-round-response">{round.userResponse}</div>
                {round.feedback && (
                  <div className="challenge-feedback">{round.feedback}</div>
                )}
              </div>
            ))}
          </div>

          <div style={{ padding: '0.75rem 1.25rem' }}>
            <button className="cs-btn cs-btn-primary" style={{ width: '100%' }} onClick={handleReset}>
              <Swords size={14} /> New Challenge
            </button>
          </div>
        </>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom'
import { Send, RotateCcw, Trophy, ChevronLeft, ChevronRight, Sparkles, AlertTriangle, Code2, Trash2 } from 'lucide-react'
import { useQuizStore } from '@/stores/quizStore'
import { useDocumentStore } from '@/stores/documentStore'
import { gradeQuiz } from '@/services/quizService'
import type { QuestionType } from '@/types'

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  choice: 'Single Choice',
  truefalse: 'True/False',
  short_answer: 'Short Answer',
  fill_blank: 'Fill in Blank',
  code_completion: 'Code Completion',
}

function renderTextWithBlank(text: string) {
  if (!text) return null
  const parts = text.split('___')
  return parts.map((part, i) => (
    <span key={i}>
      {part}
      {i < parts.length - 1 && <span className="blank-marker">___</span>}
    </span>
  ))
}

export function QuizPage() {
  const { quizId } = useParams<{ quizId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const docId = searchParams.get('docId')
  const fromPath = searchParams.get('from')

  const {
    currentQuiz, currentAttempt, isGrading, error,
    setCurrentQuiz, setCurrentAttempt, setGrading, setError,
  } = useQuizStore()

  const removeSavedQuiz = useQuizStore(s => s.removeSavedQuiz)

  const savedQuizzes = useQuizStore(s => s.savedQuizzes)
  const doc = useDocumentStore(s => s.documents.get(docId || ''))

  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})

  useEffect(() => {
    setCurrentAttempt(null)
    if (docId && savedQuizzes[docId]) {
      setCurrentQuiz(savedQuizzes[docId])
    } else if (currentQuiz && currentQuiz.id === quizId) {
      // Already loaded
    } else {
      setError('Quiz not found. Please generate a quiz from the document page first.')
    }
  }, [docId, quizId, savedQuizzes, currentQuiz, setCurrentAttempt, setCurrentQuiz, setError])

  const handleAnswer = (questionId: string, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }))
  }

  const handleSubmit = async () => {
    if (!currentQuiz) return
    setGrading(true)
    try {
      const attempt = await gradeQuiz(currentQuiz, answers)
      setCurrentAttempt(attempt)
      useQuizStore.getState().saveAttempt(attempt)
    } catch (e) {
      setError((e instanceof Error ? e.message : String(e)) || 'Grading failed')
    } finally {
      setGrading(false)
    }
  }

  const handleRetry = () => {
    setCurrentAttempt(null)
    setAnswers({})
    setCurrentIndex(0)
  }

  if (error) {
    return (
      <div className="cs-settings">
        <div className="cs-card">
          <div className="cs-card-body">
            <div className="cs-empty-hint">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-dim)' }}>
                <AlertTriangle size={20} />
              </div>
              <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0' }}>{error}</p>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button className="cs-btn cs-btn-primary" onClick={handleRetry}>
                  <RotateCcw size={14} /> Retry
                </button>
                <Link to={docId ? `/doc/${docId}` : '/'} state={{ from: fromPath || undefined }} className="cs-btn cs-btn-secondary">
                  Back
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!currentQuiz) {
    return (
      <div className="cs-settings">
        <div className="cs-card">
          <div className="cs-card-body">
            <div className="cs-empty-hint">Invalid Quiz</div>
          </div>
        </div>
      </div>
    )
  }

  const questions = currentQuiz.questions
  const currentQuestion = questions[currentIndex]
  const answeredCount = Object.keys(answers).length

  // Show scoreboard
  if (currentAttempt) {
    const percentage = Math.round((currentAttempt.totalScore / currentAttempt.maxScore) * 100)
    const passed = percentage >= 60

    return (
      <div className="cs-settings">
        <div className="cs-settings-header">
          <div className="cs-section-label">QUIZ RESULT</div>
          <h1>{passed ? 'Passed!' : 'Failed'}</h1>
          <p className="cs-settings-subtitle">{currentAttempt.totalScore} / {currentAttempt.maxScore} points ({percentage}%)</p>
        </div>

        <div className="cs-card">
          <div className="cs-card-header" style={{ justifyContent: 'center' }}>
            <Trophy size={20} style={{ color: passed ? 'var(--accent-yellow)' : 'var(--text-dim)' }} />
            <span style={{ marginLeft: '0.5rem' }}>QUIZ COMPLETE</span>
          </div>
          <div className="cs-card-body">
            <div style={{ display: 'grid', gap: '1rem' }}>
              {questions.map((q, i) => {
                const score = currentAttempt.scores[q.id]
                const isCorrect = score && score.score >= score.maxScore * 0.5
                return (
                  <div key={q.id} className="cs-quiz-result-item" style={{
                    padding: '1rem',
                    background: 'var(--bg-input)',
                    borderRadius: 'var(--radius-md)',
                    borderLeft: `3px solid ${isCorrect ? 'var(--accent-green)' : 'var(--accent-red)'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <span className={`cs-badge ${isCorrect ? 'cs-badge-green' : 'cs-badge-red'}`}>
                        Q{i + 1}
                      </span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, marginLeft: 'auto' }}>
                        {score?.score ?? 0}/{score?.maxScore ?? 100}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>{q.text}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Your answer: {q.type === 'truefalse'
                        ? (answers[q.id] === 'true' ? 'True' : answers[q.id] === 'false' ? 'False' : '—')
                        : (answers[q.id] || '—')
                      }
                      {q.type === 'choice' && (
                        <span style={{ marginLeft: '0.5rem', color: 'var(--accent-green)' }}>
                          Correct: {q.correctAnswer}. {q.options?.[q.correctAnswer.charCodeAt(0) - 65] ?? ''}
                        </span>
                      )}
                      {q.type === 'truefalse' && (
                        <span style={{ marginLeft: '0.5rem', color: 'var(--accent-green)' }}>
                          Correct: {q.correctAnswer === 'true' ? 'True' : 'False'}
                        </span>
                      )}
                      {(q.type === 'fill_blank' || q.type === 'code_completion') && (
                        <span style={{ marginLeft: '0.5rem', color: 'var(--accent-green)' }}>
                          Correct: {q.correctAnswer}
                        </span>
                      )}
                    </div>
                    {score?.feedback && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.35rem', fontStyle: 'italic' }}>
                        {score.feedback}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1.5rem' }}>
              <button className="cs-btn cs-btn-primary" onClick={handleRetry}>
                <RotateCcw size={14} /> Retake Quiz
              </button>
              <Link to={docId ? `/doc/${docId}` : '/'} state={{ from: fromPath || undefined }} className="cs-btn cs-btn-secondary">
                Back to Document
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Show quiz questions
  return (
    <div className="cs-settings">
      <div className="cs-settings-header" style={{ marginBottom: '0.75rem' }}>
        <div className="cs-section-label">QUIZ</div>
        <h1 style={{ fontSize: '1.25rem' }}>{doc?.title || 'Quiz'}</h1>
      </div>

      {/* Progress */}
      <div className="cs-card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem' }}>
          <Link
            to={docId ? `/doc/${docId}` : '/'}
            state={{ from: fromPath || undefined }}
            className="cs-btn cs-btn-secondary"
            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
          >
            <ChevronLeft size={14} /> Exit
          </Link>
          {docId && (
            <button
              className="cs-btn cs-btn-secondary"
              style={{ padding: '4px 10px', fontSize: '0.75rem', color: 'var(--accent-red)' }}
              onClick={() => {
                removeSavedQuiz(docId)
                navigate(docId ? `/doc/${docId}` : '/', { state: { from: fromPath || undefined } })
              }}
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            {answeredCount} / {questions.length}
          </span>
          <div style={{ flex: 1, height: '6px', background: 'var(--bg-input)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(answeredCount / questions.length) * 100}%`, background: 'var(--accent-blue)', borderRadius: '3px', transition: 'width 0.3s' }} />
          </div>
        </div>
      </div>

      {/* Question navigation */}
      <div className="cs-card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '0.75rem 1rem' }}>
          {questions.map((q, i) => (
            <button
              key={q.id}
              className={`quiz-question-nav-item ${i === currentIndex ? 'current' : ''} ${answers[q.id] ? 'answered' : ''}`}
              onClick={() => setCurrentIndex(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Current question */}
      <div className="question-card slide-in-right" key={currentQuestion.id}>
        <div className="question-card-header">
          <span className="question-type-badge">
            {QUESTION_TYPE_LABELS[currentQuestion.type] || currentQuestion.type}
          </span>
          <span className={`question-difficulty-badge difficulty-${currentQuestion.difficulty}`}>
            {currentQuestion.difficulty === 'easy' ? 'Easy'
              : currentQuestion.difficulty === 'medium' ? 'Medium' : 'Hard'}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
            {currentIndex + 1} / {questions.length}
          </span>
        </div>

        {!['fill_blank', 'code_completion'].includes(currentQuestion.type) && (
          <div className="question-text">{currentQuestion.text}</div>
        )}

        {(currentQuestion.type === 'choice' || currentQuestion.type === 'truefalse') && (
          <div className="question-options">
            {(currentQuestion.type === 'truefalse'
              ? ['true', 'false']
              : currentQuestion.options || []
            ).map((opt: string, i: number) => {
              const value = currentQuestion.type === 'truefalse'
                ? opt
                : String.fromCharCode(65 + i)
              return (
                <button
                  key={i}
                  className={`question-option ${answers[currentQuestion.id] === value ? 'selected' : ''}`}
                  onClick={() => handleAnswer(currentQuestion.id, value)}
                >
                  <input type="radio" readOnly checked={answers[currentQuestion.id] === value} />
                  <span>{opt}</span>
                </button>
              )
            })}
          </div>
        )}

        {currentQuestion.type === 'short_answer' && (
          <textarea
            className="question-textarea"
            placeholder="Type your answer..."
            value={answers[currentQuestion.id] || ''}
            onChange={e => handleAnswer(currentQuestion.id, e.target.value)}
          />
        )}

        {currentQuestion.type === 'fill_blank' && (
          <div className="question-fill-blank">
            <div className="question-text">
              {renderTextWithBlank(currentQuestion.text)}
            </div>
            <input
              type="text"
              className="question-fill-input"
              placeholder={currentQuestion.placeholder || 'Type your answer...'}
              value={answers[currentQuestion.id] || ''}
              onChange={e => handleAnswer(currentQuestion.id, e.target.value)}
            />
          </div>
        )}

        {currentQuestion.type === 'code_completion' && (
          <div className="question-code-block">
            {currentQuestion.text && (
              <div className="question-text">{currentQuestion.text}</div>
            )}
            <div className="question-code-header">
              <Code2 size={14} />
              <span>Complete the code</span>
            </div>
            <pre className="question-code-snippet">
              <code>{renderTextWithBlank(currentQuestion.codeSnippet || '')}</code>
            </pre>
            <textarea
              className="question-code-input"
              placeholder="Enter the code to fill in the blank..."
              value={answers[currentQuestion.id] || ''}
              onChange={e => handleAnswer(currentQuestion.id, e.target.value)}
              rows={3}
            />
          </div>
        )}
      </div>

      {/* Navigation & Submit */}
      <div className="question-actions">
        <button
          className="cs-btn cs-btn-secondary"
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex(i => i - 1)}
        >
          <ChevronLeft size={14} /> Previous
        </button>
        {currentIndex < questions.length - 1 ? (
          <button
            className="cs-btn cs-btn-primary"
            onClick={() => setCurrentIndex(i => i + 1)}
          >
            Next <ChevronRight size={14} />
          </button>
        ) : (
          <button
            className="cs-btn cs-btn-primary"
            disabled={answeredCount < questions.length || isGrading}
            onClick={handleSubmit}
          >
            {isGrading ? (
              <>
                <span className="spin" style={{ display: 'inline-flex' }}>
                  <Sparkles size={14} />
                </span>
                AI Grading...
              </>
            ) : (
              <>
                <Send size={14} /> Submit Quiz
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

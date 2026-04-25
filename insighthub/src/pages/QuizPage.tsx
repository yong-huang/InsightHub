import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Send, RotateCcw, Trophy, ChevronLeft, ChevronRight, Sparkles, AlertTriangle } from 'lucide-react'
import { useQuizStore } from '@/stores/quizStore'
import { useDocumentStore } from '@/stores/documentStore'
import { gradeQuiz } from '@/services/quizService'
import type { QuizAttempt } from '@/types'

export function QuizPage() {
  const { quizId } = useParams<{ quizId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const docId = searchParams.get('docId')
  const fromPath = searchParams.get('from')

  const {
    currentQuiz, currentAttempt, isGrading, error,
    setCurrentQuiz, setCurrentAttempt, setGrading, setError, reset,
  } = useQuizStore()

  const savedQuizzes = useQuizStore(s => s.savedQuizzes)
  const doc = useDocumentStore(s => s.documents.get(docId || ''))

  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})

  // Load quiz from persisted store — re-run when savedQuizzes changes
  useEffect(() => {
    // Clear previous attempt so we always start a fresh quiz
    setCurrentAttempt(null)
    if (docId && savedQuizzes[docId]) {
      setCurrentQuiz(savedQuizzes[docId])
    } else if (currentQuiz && currentQuiz.id === quizId) {
      // Already loaded
    } else {
      // No saved quiz found
      setError('Quiz not found. Please generate a quiz from the document page first.')
    }
  }, [docId, quizId, savedQuizzes])

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
    } catch (e: any) {
      setError(e.message || 'Grading failed')
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
      <div className="quiz-container">
        <div className="quiz-error">
          <div className="quiz-error-icon">
            <AlertTriangle size={40} />
          </div>
          <h3>Error</h3>
          <p>{error}</p>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={handleRetry}>
              <RotateCcw size={14} /> Retry
            </button>
            <Link to={docId ? `/doc/${docId}` : '/'} state={{ from: fromPath || undefined }} className="btn btn-secondary">
              Back
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!currentQuiz) {
    return (
      <div className="quiz-container">
        <div className="empty-state">
          <h3>Invalid Quiz</h3>
          <Link to="/" className="btn btn-primary">Go Home</Link>
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
      <div className="quiz-container">
        <div className="scoreboard">
          <Trophy size={40} style={{ color: passed ? 'var(--accent-yellow)' : 'var(--text-dim)' }} />
          <h2>Quiz Complete!</h2>
          <div className={`scoreboard-score ${passed ? 'score-pass' : 'score-fail'}`}>
            {currentAttempt.totalScore} / {currentAttempt.maxScore}
          </div>
          <div className="scoreboard-detail">
            Score {percentage}% · {passed ? 'Passed' : 'Failed'}
          </div>

          {questions.map((q, i) => {
            const score = currentAttempt.scores[q.id]
            const isCorrect = score && score.score >= 60
            return (
              <div key={q.id} className="scoreboard-question">
                <div className="scoreboard-question-header">
                  <span className={`badge ${isCorrect ? 'badge-read' : 'badge-unread'}`}>
                    Q{i + 1}
                  </span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    {score?.score ?? 0}/{score?.maxScore ?? 100}
                  </span>
                </div>
                <div className="scoreboard-question-text">{q.text}</div>
                <div className="scoreboard-question-answer">
                  Your answer: {q.type === 'truefalse'
                    ? (answers[q.id] === 'true' ? 'True' : answers[q.id] === 'false' ? 'False' : '(Not answered)')
                    : (answers[q.id] || '(Not answered)')}
                  }
                  {q.type === 'choice' && (
                    <span style={{ marginLeft: '0.5rem' }}>
                      Correct answer: {q.correctAnswer}. {q.options?.[q.correctAnswer.charCodeAt(0) - 65] ?? ''}
                    </span>
                  )}
                  {q.type === 'truefalse' && (
                    <span style={{ marginLeft: '0.5rem' }}>
                      Correct answer: {q.correctAnswer === 'true' ? 'True' : 'False'}
                    </span>
                  )}
                </div>
                {score?.feedback && (
                  <div className="scoreboard-question-feedback">{score.feedback}</div>
                )}
              </div>
            )
          })}

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1.5rem' }}>
            <button className="btn btn-primary" onClick={handleRetry}>
              <RotateCcw size={14} /> Retake Quiz
            </button>
            <Link to={docId ? `/doc/${docId}` : '/'} state={{ from: fromPath || undefined }} className="btn btn-secondary">
              Back to Document
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Show quiz questions
  return (
    <div className="quiz-container">
      {/* Progress */}
      <div className="quiz-progress-bar">
        <Link
          to={docId ? `/doc/${docId}` : '/'}
          state={{ from: fromPath || undefined }}
          className="btn btn-ghost btn-sm"
          style={{ marginRight: '0.5rem' }}
        >
          <ArrowLeft size={18} /> Exit
        </Link>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {answeredCount} / {questions.length} answered
        </span>
        <div className="progress-bar" style={{ flex: 1 }}>
          <div
            className="progress-fill"
            style={{ width: `${(answeredCount / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Question navigation */}
      <div className="quiz-question-nav">
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

      {/* Current question */}
      <div className="question-card slide-in-right" key={currentQuestion.id}>
        <div className="question-card-header">
          <span className="question-type-badge">
            {currentQuestion.type === 'choice' ? 'Multiple Choice'
              : currentQuestion.type === 'truefalse' ? 'True/False'
                : 'Short Answer'}
          </span>
          <span className={`question-difficulty-badge difficulty-${currentQuestion.difficulty}`}>
            {currentQuestion.difficulty === 'easy' ? 'Easy'
              : currentQuestion.difficulty === 'medium' ? 'Medium' : 'Hard'}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
            {currentIndex + 1} / {questions.length}
          </span>
        </div>

        <div className="question-text">{currentQuestion.text}</div>

        {/* Choice / TrueFalse */}
        {(currentQuestion.type === 'choice' || currentQuestion.type === 'truefalse') && (
          <div className="question-options">
            {(currentQuestion.type === 'truefalse'
              ? ['true', 'false']
              : currentQuestion.options || []
            ).map((opt: string, i: number) => {
              const optLetter = currentQuestion.type === 'choice'
                ? String.fromCharCode(65 + i)
                : opt === 'true' ? 'T' : 'F'
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

        {/* Short Answer */}
        {currentQuestion.type === 'short_answer' && (
          <textarea
            className="question-textarea"
            placeholder="Type your answer..."
            value={answers[currentQuestion.id] || ''}
            onChange={e => handleAnswer(currentQuestion.id, e.target.value)}
          />
        )}
      </div>

      {/* Navigation & Submit */}
      <div className="question-actions">
        <button
          className="btn btn-secondary"
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex(i => i - 1)}
        >
          <ChevronLeft size={16} /> Previous
        </button>
        {currentIndex < questions.length - 1 ? (
          <button
            className="btn btn-primary"
            onClick={() => setCurrentIndex(i => i + 1)}
          >
            Next <ChevronRight size={16} />
          </button>
        ) : (
          <button
            className="btn btn-primary"
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

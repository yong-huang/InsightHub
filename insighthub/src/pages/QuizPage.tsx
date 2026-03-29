import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Send, RotateCcw, Trophy, ChevronLeft, ChevronRight, Sparkles, AlertTriangle } from 'lucide-react'
import { useQuizStore } from '@/stores/quizStore'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDocumentStore } from '@/stores/documentStore'
import { createQuiz, gradeQuiz } from '@/services/quizService'
import type { Question, QuizAttempt } from '@/types'

export function QuizPage() {
  const { quizId } = useParams<{ quizId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const docId = searchParams.get('docId')

  const {
    currentQuiz, currentAttempt, isLoading, isGrading, error,
    setCurrentQuiz, setCurrentAttempt, setLoading, setGrading, setError, reset,
  } = useQuizStore()

  const { quizDifficulty, quizQuestionCount } = usePreferenceStore()
  const doc = useDocumentStore(s => s.documents.get(docId || ''))

  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})

  // Generate quiz if new
  useEffect(() => {
    if (quizId === 'new' && doc) {
      let cancelled = false
      setLoading(true)
      setError(null)
      createQuiz(doc, quizDifficulty, quizQuestionCount)
        .then(({ quiz, error: err }) => {
          if (cancelled) return
          if (err) {
            setError(err)
          } else {
            setCurrentQuiz(quiz)
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
      return () => { cancelled = true }
    }
  }, [quizId, docId])

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
      setError(e.message || '评分失败')
    } finally {
      setGrading(false)
    }
  }

  const handleRetry = () => {
    setAnswers({})
    setCurrentIndex(0)
    setCurrentAttempt(null)
    setError(null)
    navigate(`/quiz/new?docId=${docId}`)
  }

  if (error) {
    return (
      <div className="quiz-container">
        <div className="quiz-error">
          <div className="quiz-error-icon">
            <AlertTriangle size={40} />
          </div>
          <h3>出错了</h3>
          <p>{error}</p>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={handleRetry}>
              <RotateCcw size={14} /> 重试
            </button>
            <Link to={docId ? `/doc/${docId}` : '/'} className="btn btn-secondary">
              返回
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="quiz-container">
        <div className="quiz-loading">
          <div className="pulse-glow" style={{
            width: 60, height: 60, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1.5rem', background: 'rgba(50,108,229,0.15)',
          }}>
            <Sparkles size={28} style={{ color: 'var(--accent-blue)' }} />
          </div>
          <h2 className="gradient-text">AI 正在生成测验题...</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            基于文档内容生成 {quizQuestionCount} 道题目
          </p>
        </div>
      </div>
    )
  }

  if (!currentQuiz) {
    return (
      <div className="quiz-container">
        <div className="empty-state">
          <h3>无效的测验</h3>
          <Link to="/" className="btn btn-primary">返回首页</Link>
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
          <h2>测验完成！</h2>
          <div className={`scoreboard-score ${passed ? 'score-pass' : 'score-fail'}`}>
            {currentAttempt.totalScore} / {currentAttempt.maxScore}
          </div>
          <div className="scoreboard-detail">
            得分率 {percentage}% · {passed ? '通过' : '未通过'}
          </div>

          {questions.map((q, i) => {
            const score = currentAttempt.scores[q.id]
            const isCorrect = score && score.score >= 60
            return (
              <div key={q.id} className="scoreboard-question">
                <div className="scoreboard-question-header">
                  <span className={`badge ${isCorrect ? 'badge-read' : 'badge-unread'}`}>
                    第 {i + 1} 题
                  </span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    {score?.score ?? 0}/{score?.maxScore ?? 100}
                  </span>
                </div>
                <div className="scoreboard-question-text">{q.text}</div>
                <div className="scoreboard-question-answer">
                  你的回答：{answers[q.id] || '（未作答）'}
                  {q.type !== 'short_answer' && (
                    <span style={{ marginLeft: '0.5rem' }}>
                      正确答案：{q.correctAnswer}
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
              <RotateCcw size={14} /> 重新测验
            </button>
            <Link to={docId ? `/doc/${docId}` : '/'} className="btn btn-secondary">
              返回文档
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
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {answeredCount} / {questions.length} 已作答
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
            {currentQuestion.type === 'choice' ? '选择题'
              : currentQuestion.type === 'truefalse' ? '判断题'
                : '简答题'}
          </span>
          <span className={`question-difficulty-badge difficulty-${currentQuestion.difficulty}`}>
            {currentQuestion.difficulty === 'easy' ? '简单'
              : currentQuestion.difficulty === 'medium' ? '中等' : '困难'}
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
            placeholder="请输入你的回答..."
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
          <ChevronLeft size={16} /> 上一题
        </button>
        {currentIndex < questions.length - 1 ? (
          <button
            className="btn btn-primary"
            onClick={() => setCurrentIndex(i => i + 1)}
          >
            下一题 <ChevronRight size={16} />
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
                AI 评分中...
              </>
            ) : (
              <>
                <Send size={14} /> 提交测验
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

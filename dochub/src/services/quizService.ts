import type { Quiz, QuizAttempt, Question, Difficulty } from '@/types'
import { generateQuizQuestions, gradeShortAnswers } from './aiService'
import type { Document } from '@/types'

export function parseQuizResponse(data: any, documentId: string, documentTitle: string): Quiz {
  const questions: Question[] = (data.questions || []).map((q: any, i: number) => ({
    id: q.id || `q${i + 1}`,
    type: q.type || 'choice',
    difficulty: q.difficulty || 'medium',
    text: q.text || '',
    options: q.options,
    correctAnswer: q.correctAnswer || '',
    explanation: q.explanation || '',
  }))

  return {
    id: `quiz-${Date.now()}`,
    documentId,
    documentTitle,
    questions,
    createdAt: Date.now(),
    totalScore: 0,
    maxScore: questions.length * 100,
  }
}

export async function createQuiz(
  doc: Document,
  difficulty: Difficulty,
  questionCount: number
): Promise<{ quiz: Quiz; error?: string }> {
  const result = await generateQuizQuestions(
    doc.title,
    doc.contentText,
    difficulty,
    questionCount
  )

  if (!result.success || !result.data) {
    return { quiz: {} as Quiz, error: result.error || '生成题目失败' }
  }

  const quiz = parseQuizResponse(result.data, doc.id, doc.title)
  return { quiz }
}

export function gradeObjectiveQuestions(
  quiz: Quiz,
  answers: Record<string, string>
): Record<string, { score: number; maxScore: number; feedback?: string }> {
  const scores: Record<string, { score: number; maxScore: number; feedback?: string }> = {}

  for (const q of quiz.questions) {
    if (q.type === 'short_answer') continue

    const userAnswer = (answers[q.id] || '').trim().toLowerCase()
    const correctAnswer = q.correctAnswer.trim().toLowerCase()

    if (q.type === 'truefalse') {
      const isCorrect = userAnswer === 'true' || userAnswer === '1' || userAnswer === correctAnswer
      scores[q.id] = {
        score: isCorrect ? 100 : 0,
        maxScore: 100,
        feedback: isCorrect ? '正确！' : `错误。${q.explanation}`,
      }
    } else if (q.type === 'choice') {
      const isCorrect = userAnswer === correctAnswer ||
        userAnswer === correctAnswer.charAt(0) ||
        userAnswer === q.correctAnswer.charAt(0)
      scores[q.id] = {
        score: isCorrect ? 100 : 0,
        maxScore: 100,
        feedback: isCorrect ? '正确！' : `正确答案是 ${q.correctAnswer}。${q.explanation}`,
      }
    }
  }

  return scores
}

export async function gradeQuiz(
  quiz: Quiz,
  answers: Record<string, string>
): Promise<QuizAttempt> {
  // Grade objective questions locally
  const objectiveScores = gradeObjectiveQuestions(quiz, answers)

  // Get short answer questions
  const shortAnswerQuestions = quiz.questions.filter(q => q.type === 'short_answer')
  let aiScores: Record<string, { score: number; maxScore: number; feedback?: string }> = {}

  // Grade short answers with AI if there are any
  if (shortAnswerQuestions.length > 0) {
    const result = await gradeShortAnswers(
      shortAnswerQuestions.map(q => ({
        id: q.id,
        text: q.text,
        correctAnswer: q.correctAnswer,
      })),
      answers
    )
    if (result.success && result.data?.scores) {
      aiScores = result.data.scores
    } else {
      // Fallback: mark all short answers as 0
      for (const q of shortAnswerQuestions) {
        aiScores[q.id] = { score: 0, maxScore: 100, feedback: 'AI 评分不可用' }
      }
    }
  }

  // Combine scores
  const allScores = { ...objectiveScores, ...aiScores }

  const totalScore = Object.values(allScores).reduce((sum, s) => sum + s.score, 0)
  const maxScore = quiz.questions.length * 100

  return {
    id: `attempt-${Date.now()}`,
    quizId: quiz.id,
    documentId: quiz.documentId,
    answers,
    scores: allScores,
    totalScore,
    maxScore,
    completedAt: Date.now(),
    aiGraded: shortAnswerQuestions.length > 0,
  }
}

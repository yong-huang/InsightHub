import type { Quiz, QuizAttempt, Question, Difficulty, QuestionType } from '@/types'
import { generateQuizQuestions, gradeShortAnswers } from './aiService'
import type { Document } from '@/types'

export function parseQuizResponse(data: any, documentId: string, documentTitle: string): Quiz {
  const questions: Question[] = (data.questions || []).map((q: any, i: number) => ({
    id: q.id || `q${i + 1}`,
    type: (q.type || 'choice') as QuestionType,
    difficulty: q.difficulty || 'medium',
    text: q.text || '',
    options: q.options,
    correctAnswer: q.correctAnswer || '',
    explanation: q.explanation || '',
    codeSnippet: q.codeSnippet,
    placeholder: q.placeholder,
  }))

  return {
    id: `quiz-${documentId}`,
    documentId,
    documentTitle,
    questions,
    createdAt: Date.now(),
    totalScore: 0,
    maxScore: 100,
  }
}

export async function createQuiz(
  doc: Document,
  difficulty: Difficulty,
  questionCount: number,
  enabledTypes?: QuestionType[]
): Promise<{ quiz: Quiz; error?: string }> {
  const result = await generateQuizQuestions(
    doc.title,
    doc.contentText,
    difficulty,
    questionCount,
    enabledTypes
  )

  if (!result.success || !result.data) {
    return { quiz: {} as Quiz, error: result.error || 'Failed to generate questions' }
  }

  const quiz = parseQuizResponse(result.data, doc.id, doc.title)
  return { quiz }
}

export function gradeObjectiveQuestions(
  quiz: Quiz,
  answers: Record<string, string>
): Record<string, { score: number; maxScore: number; feedback?: string }> {
  const scores: Record<string, { score: number; maxScore: number; feedback?: string }> = {}
  const perQuestion = Math.round(100 / quiz.questions.length)

  for (const q of quiz.questions) {
    if (q.type === 'short_answer' || q.type === 'code_completion') continue

    const userAnswer = (answers[q.id] || '').trim().toLowerCase()
    const correctAnswer = q.correctAnswer.trim().toLowerCase()

    if (q.type === 'truefalse') {
      const normalizedUser = userAnswer === '1' ? 'true' : userAnswer === '0' ? 'false' : userAnswer
      const normalizedCorrect = correctAnswer === '1' ? 'true' : correctAnswer === '0' ? 'false' : correctAnswer
      const isCorrect = normalizedUser === normalizedCorrect
      scores[q.id] = {
        score: isCorrect ? perQuestion : 0,
        maxScore: perQuestion,
        feedback: isCorrect ? 'Correct!' : `Incorrect. ${q.explanation}`,
      }
    } else if (q.type === 'choice') {
      const isCorrect = userAnswer === correctAnswer ||
        userAnswer === q.correctAnswer.trim() ||
        (correctAnswer.length === 1 && userAnswer.startsWith(correctAnswer))
      scores[q.id] = {
        score: isCorrect ? perQuestion : 0,
        maxScore: perQuestion,
        feedback: isCorrect ? 'Correct!' : `The correct answer is ${q.correctAnswer}. ${q.explanation}`,
      }
    } else if (q.type === 'fill_blank') {
      // Case-insensitive exact match for fill-in-the-blank
      const isCorrect = userAnswer === correctAnswer
      scores[q.id] = {
        score: isCorrect ? perQuestion : 0,
        maxScore: perQuestion,
        feedback: isCorrect ? 'Correct!' : `The correct answer is "${q.correctAnswer}". ${q.explanation}`,
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

  // Get short answer and code completion questions (need AI grading)
  const aiGradeQuestions = quiz.questions.filter(q => q.type === 'short_answer' || q.type === 'code_completion')
  const aiScores: Record<string, { score: number; maxScore: number; feedback?: string }> = {}

  // Grade with AI if there are any
  if (aiGradeQuestions.length > 0) {
    const result = await gradeShortAnswers(
      aiGradeQuestions.map(q => ({
        id: q.id,
        text: q.type === 'code_completion' ? `Complete the code:\n${q.codeSnippet || q.text}` : q.text,
        correctAnswer: q.correctAnswer,
      })),
      answers
    )
    if (result.success && result.data?.scores) {
      const perQuestion = Math.round(100 / quiz.questions.length)
      for (const [qId, s] of Object.entries(result.data.scores)) {
        const raw = (s as any).score ?? 0
        aiScores[qId] = {
          score: Math.round(raw / 100 * perQuestion),
          maxScore: perQuestion,
          feedback: (s as any).feedback,
        }
      }
    } else {
      for (const q of aiGradeQuestions) {
        const perQuestion = Math.round(100 / quiz.questions.length)
        aiScores[q.id] = { score: 0, maxScore: perQuestion, feedback: 'AI grading unavailable' }
      }
    }
  }

  // Combine scores
  const allScores = { ...objectiveScores, ...aiScores }

  const totalScore = Object.values(allScores).reduce((sum, s) => sum + s.score, 0)
  const maxScore = 100

  return {
    id: `attempt-${Date.now()}`,
    quizId: quiz.id,
    documentId: quiz.documentId,
    answers,
    scores: allScores,
    totalScore,
    maxScore,
    completedAt: Date.now(),
    aiGraded: aiGradeQuestions.length > 0,
  }
}

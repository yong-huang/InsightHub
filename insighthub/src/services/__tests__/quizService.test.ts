import { describe, it, expect } from 'vitest'
import { parseQuizResponse, gradeObjectiveQuestions } from '../quizService'
import type { Quiz } from '@/types'

function makeQuiz(questions: Quiz['questions']): Quiz {
  return {
    id: 'quiz-doc1',
    documentId: 'doc1',
    documentTitle: 'Test Doc',
    questions,
    createdAt: Date.now(),
    totalScore: 0,
    maxScore: 100,
  }
}

describe('parseQuizResponse', () => {
  it('parses normal quiz data with all fields', () => {
    const data = {
      questions: [
        {
          id: 'q1',
          type: 'choice',
          difficulty: 'easy',
          text: 'What is 2+2?',
          options: ['3', '4', '5', '6'],
          correctAnswer: 'B',
          explanation: 'Basic arithmetic.',
        },
        {
          id: 'q2',
          type: 'truefalse',
          difficulty: 'hard',
          text: 'The sky is blue.',
          correctAnswer: 'true',
          explanation: 'It is blue during clear day.',
        },
      ],
    }
    const quiz = parseQuizResponse(data, 'doc-1', 'Test Document')
    expect(quiz.id).toBe('quiz-doc-1')
    expect(quiz.documentId).toBe('doc-1')
    expect(quiz.documentTitle).toBe('Test Document')
    expect(quiz.questions).toHaveLength(2)
    expect(quiz.questions[0].type).toBe('choice')
    expect(quiz.questions[1].type).toBe('truefalse')
    expect(quiz.maxScore).toBe(100)
    expect(quiz.totalScore).toBe(0)
  })

  it('applies fallbacks for missing fields', () => {
    const data = {
      questions: [
        { text: 'Question?' },
        {},
      ],
    }
    const quiz = parseQuizResponse(data, 'doc1', 'Doc')
    expect(quiz.questions[0].id).toBe('q1')
    expect(quiz.questions[0].type).toBe('choice')
    expect(quiz.questions[0].difficulty).toBe('medium')
    expect(quiz.questions[0].explanation).toBe('')
    expect(quiz.questions[1].id).toBe('q2')
    expect(quiz.questions[1].text).toBe('')
  })

  it('handles empty questions array', () => {
    const quiz = parseQuizResponse({ questions: [] }, 'doc1', 'Doc')
    expect(quiz.questions).toHaveLength(0)
  })

  it('handles missing questions field', () => {
    const quiz = parseQuizResponse({}, 'doc1', 'Doc')
    expect(quiz.questions).toHaveLength(0)
  })
})

describe('gradeObjectiveQuestions', () => {
  it('grades choice question correct', () => {
    const quiz = makeQuiz([
      { id: 'q1', type: 'choice', difficulty: 'easy', text: 'Q?', options: ['A', 'B', 'C', 'D'], correctAnswer: 'B', explanation: 'E' },
    ])
    const scores = gradeObjectiveQuestions(quiz, { q1: 'B' })
    expect(scores.q1.score).toBe(100)
    expect(scores.q1.maxScore).toBe(100)
    expect(scores.q1.feedback).toBe('Correct!')
  })

  it('grades choice question incorrect', () => {
    const quiz = makeQuiz([
      { id: 'q1', type: 'choice', difficulty: 'easy', text: 'Q?', options: ['A', 'B', 'C', 'D'], correctAnswer: 'B', explanation: 'Wrong.' },
    ])
    const scores = gradeObjectiveQuestions(quiz, { q1: 'A' })
    expect(scores.q1.score).toBe(0)
    expect(scores.q1.feedback).toContain('The correct answer is B')
  })

  it('grades choice case insensitive', () => {
    const quiz = makeQuiz([
      { id: 'q1', type: 'choice', difficulty: 'easy', text: 'Q?', options: ['A', 'B'], correctAnswer: 'B', explanation: 'E' },
    ])
    const scores = gradeObjectiveQuestions(quiz, { q1: 'b' })
    expect(scores.q1.score).toBe(100)
  })

  it('grades choice with single-char prefix match (A vs ABC)', () => {
    const quiz = makeQuiz([
      { id: 'q1', type: 'choice', difficulty: 'easy', text: 'Q?', options: ['Alpha', 'Beta', 'Charlie'], correctAnswer: 'A', explanation: 'E' },
    ])
    // User types "ABC" but correct is "A" — single-char match via startsWith
    const scores = gradeObjectiveQuestions(quiz, { q1: 'ABC' })
    expect(scores.q1.score).toBe(100)
  })

  it('grades true/false correct', () => {
    const quiz = makeQuiz([
      { id: 'q1', type: 'truefalse', difficulty: 'easy', text: 'Q?', correctAnswer: 'true', explanation: 'E' },
    ])
    const scores = gradeObjectiveQuestions(quiz, { q1: 'true' })
    expect(scores.q1.score).toBe(100)
  })

  it('grades true/false incorrect', () => {
    const quiz = makeQuiz([
      { id: 'q1', type: 'truefalse', difficulty: 'easy', text: 'Q?', correctAnswer: 'false', explanation: 'Nope.' },
    ])
    const scores = gradeObjectiveQuestions(quiz, { q1: 'true' })
    expect(scores.q1.score).toBe(0)
  })

  it('grades true/false with numeric normalization (1→true, 0→false)', () => {
    const quiz = makeQuiz([
      { id: 'q1', type: 'truefalse', difficulty: 'easy', text: 'Q?', correctAnswer: 'true', explanation: 'E' },
      { id: 'q2', type: 'truefalse', difficulty: 'easy', text: 'Q?', correctAnswer: 'false', explanation: 'E' },
    ])
    const scores = gradeObjectiveQuestions(quiz, { q1: '1', q2: '0' })
    // 2 questions → perQuestionScore: 50 each
    expect(scores.q1.score).toBe(50)
    expect(scores.q2.score).toBe(50)
  })

  it('grades fill_blank correct', () => {
    const quiz = makeQuiz([
      { id: 'q1', type: 'fill_blank', difficulty: 'easy', text: 'The ___ is hot.', correctAnswer: 'sun', explanation: 'E' },
    ])
    const scores = gradeObjectiveQuestions(quiz, { q1: 'sun' })
    expect(scores.q1.score).toBe(100)
  })

  it('grades fill_blank incorrect', () => {
    const quiz = makeQuiz([
      { id: 'q1', type: 'fill_blank', difficulty: 'easy', text: 'The ___ is hot.', correctAnswer: 'sun', explanation: 'E' },
    ])
    const scores = gradeObjectiveQuestions(quiz, { q1: 'moon' })
    expect(scores.q1.score).toBe(0)
  })

  it('grades fill_blank case insensitive', () => {
    const quiz = makeQuiz([
      { id: 'q1', type: 'fill_blank', difficulty: 'easy', text: 'The ___ is hot.', correctAnswer: 'Sun', explanation: 'E' },
    ])
    const scores = gradeObjectiveQuestions(quiz, { q1: 'sun' })
    expect(scores.q1.score).toBe(100)
  })

  it('skips short_answer questions', () => {
    const quiz = makeQuiz([
      { id: 'q1', type: 'short_answer', difficulty: 'easy', text: 'Explain?', correctAnswer: 'Because', explanation: 'E' },
    ])
    const scores = gradeObjectiveQuestions(quiz, { q1: 'test' })
    expect(scores).toEqual({})
  })

  it('skips code_completion questions', () => {
    const quiz = makeQuiz([
      { id: 'q1', type: 'code_completion', difficulty: 'hard', text: 'Complete code', codeSnippet: 'const x = ___', correctAnswer: '42', explanation: 'E' },
    ])
    const scores = gradeObjectiveQuestions(quiz, { q1: '42' })
    expect(scores).toEqual({})
  })

  it('score distribution sums to 100 for 3 questions', () => {
    const quiz = makeQuiz([
      { id: 'q1', type: 'choice', difficulty: 'easy', text: 'Q1?', options: ['A', 'B'], correctAnswer: 'A', explanation: 'E' },
      { id: 'q2', type: 'choice', difficulty: 'easy', text: 'Q2?', options: ['A', 'B'], correctAnswer: 'B', explanation: 'E' },
      { id: 'q3', type: 'choice', difficulty: 'easy', text: 'Q3?', options: ['A', 'B'], correctAnswer: 'A', explanation: 'E' },
    ])
    const scores = gradeObjectiveQuestions(quiz, { q1: 'A', q2: 'B', q3: 'A' })
    const totalMax = Object.values(scores).reduce((s, r) => s + r.maxScore, 0)
    expect(totalMax).toBe(100)
    // 100/3 = 33 remainder 1 → 34, 33, 33
    expect(scores.q1.maxScore).toBe(34)
    expect(scores.q2.maxScore).toBe(33)
    expect(scores.q3.maxScore).toBe(33)
  })

  it('score distribution sums to 100 for 7 questions', () => {
    const quiz = makeQuiz(
      Array.from({ length: 7 }, (_, i) => ({
        id: `q${i + 1}`,
        type: 'choice' as const,
        difficulty: 'easy' as const,
        text: `Q${i + 1}?`,
        options: ['A', 'B'],
        correctAnswer: 'A',
        explanation: 'E',
      }))
    )
    const answers: Record<string, string> = {}
    for (let i = 1; i <= 7; i++) answers[`q${i}`] = 'A'
    const scores = gradeObjectiveQuestions(quiz, answers)
    const totalMax = Object.values(scores).reduce((s, r) => s + r.maxScore, 0)
    expect(totalMax).toBe(100)
    // 100/7 = 14 remainder 2 → first 2 get 15, rest get 14
    expect(scores.q1.maxScore).toBe(15)
    expect(scores.q2.maxScore).toBe(15)
    expect(scores.q3.maxScore).toBe(14)
  })

  it('single question gets score of 100', () => {
    const quiz = makeQuiz([
      { id: 'q1', type: 'choice', difficulty: 'easy', text: 'Q?', options: ['A', 'B'], correctAnswer: 'A', explanation: 'E' },
    ])
    const scores = gradeObjectiveQuestions(quiz, { q1: 'A' })
    expect(scores.q1.maxScore).toBe(100)
  })

  it('100 questions: each gets maxScore of 1', () => {
    const quiz = makeQuiz(
      Array.from({ length: 100 }, (_, i) => ({
        id: `q${i + 1}`,
        type: 'choice' as const,
        difficulty: 'easy' as const,
        text: `Q${i + 1}?`,
        options: ['A', 'B'],
        correctAnswer: 'A',
        explanation: 'E',
      }))
    )
    const answers: Record<string, string> = {}
    for (let i = 1; i <= 100; i++) answers[`q${i}`] = 'A'
    const scores = gradeObjectiveQuestions(quiz, answers)
    expect(scores.q1.maxScore).toBe(1)
    expect(scores.q100.maxScore).toBe(1)
    const totalMax = Object.values(scores).reduce((s, r) => s + r.maxScore, 0)
    expect(totalMax).toBe(100)
  })

  it('scores all objective questions regardless of whether answered', () => {
    const quiz = makeQuiz([
      { id: 'q1', type: 'choice', difficulty: 'easy', text: 'Q1?', options: ['A', 'B'], correctAnswer: 'A', explanation: 'E' },
      { id: 'q2', type: 'choice', difficulty: 'easy', text: 'Q2?', options: ['A', 'B'], correctAnswer: 'B', explanation: 'E' },
    ])
    // q2 is not in answers — gets score 0 but still has a maxScore entry
    const scores = gradeObjectiveQuestions(quiz, { q1: 'A' })
    expect(scores.q1).toBeDefined()
    expect(scores.q1.score).toBe(50)
    expect(scores.q2).toBeDefined()
    expect(scores.q2.score).toBe(0)
    expect(scores.q2.maxScore).toBe(50)
  })

  it('mixed question types: grades objective, skips others', () => {
    const quiz = makeQuiz([
      { id: 'q1', type: 'choice', difficulty: 'easy', text: 'Q?', options: ['A', 'B'], correctAnswer: 'A', explanation: 'E' },
      { id: 'q2', type: 'short_answer', difficulty: 'easy', text: 'Explain?', correctAnswer: 'Because', explanation: 'E' },
      { id: 'q3', type: 'truefalse', difficulty: 'easy', text: 'Q?', correctAnswer: 'true', explanation: 'E' },
      { id: 'q4', type: 'code_completion', difficulty: 'hard', text: 'Complete', codeSnippet: '___', correctAnswer: 'x', explanation: 'E' },
    ])
    // Only 2 gradable (q1, q3) out of 4 questions → perQuestionScore based on 4 total
    // base=25, remainder=0 → each gets 25
    const scores = gradeObjectiveQuestions(quiz, { q1: 'A', q2: 'ans', q3: 'true', q4: 'x' })
    expect(Object.keys(scores)).toEqual(['q1', 'q3'])
    expect(scores.q1.score).toBe(25)
    expect(scores.q1.maxScore).toBe(25)
    expect(scores.q3.score).toBe(25)
    expect(scores.q3.maxScore).toBe(25)
  })
})

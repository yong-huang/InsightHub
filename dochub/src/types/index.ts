// ========== Document Types ==========
export interface Document {
  id: string
  title: string
  filePath: string
  fileName: string
  source: 'mindinsight' | 'techinsight'
  category: string
  subcategory?: string
  language: 'zh' | 'en' | 'mixed'
  wordCount: number
  sections: Section[]
  contentText: string
  tags: string[]
  isRead: boolean
  lastReadAt?: number
  readCount: number
  indexedAt?: number
}

export interface Section {
  id: string
  title: string
  level: 2 | 3
}

// ========== Tag Types ==========
export interface Tag {
  id: string
  name: string
  color: string
  documentIds: string[]
}

// ========== Search Types ==========
export interface SearchResult {
  id: string
  title: string
  category: string
  source: 'mindinsight' | 'techinsight'
  score: number
  snippet?: string
}

export interface SearchFilters {
  source?: 'mindinsight' | 'techinsight'
  category?: string
  tag?: string
  isRead?: boolean | null
}

// ========== Quiz Types ==========
export type QuestionType = 'choice' | 'truefalse' | 'short_answer'
export type Difficulty = 'easy' | 'medium' | 'hard'

export interface Question {
  id: string
  type: QuestionType
  difficulty: Difficulty
  text: string
  options?: string[] // for choice questions
  correctAnswer: string
  explanation: string
}

export interface Quiz {
  id: string
  documentId: string
  documentTitle: string
  questions: Question[]
  createdAt: number
  totalScore: number
  maxScore: number
}

export interface QuizAttempt {
  id: string
  quizId: string
  documentId: string
  answers: Record<string, string>
  scores: Record<string, { score: number; maxScore: number; feedback?: string }>
  totalScore: number
  maxScore: number
  completedAt: number
  aiGraded?: boolean
}

// ========== User Preferences ==========
export interface UserPreferences {
  theme: 'light' | 'dark'
  quizDifficulty: Difficulty
  quizQuestionCount: number
  sidebarCollapsed: boolean
}

// ========== Category ==========
export interface CategoryInfo {
  key: string
  label: string
  source: 'mindinsight' | 'techinsight'
  icon: string
  count: number
}

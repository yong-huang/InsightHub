// ========== Source Type ==========
export type Source = 'mindinsight' | 'techinsight' | 'leetcodeinsight'

// ========== Document Types ==========
export interface Document {
  id: string
  title: string
  filePath: string
  fileName: string
  source: Source
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
  source: Source
  score: number
  snippet?: string
}

export interface SearchFilters {
  source?: Source
  category?: string
  tag?: string
  isRead?: boolean | null
  sortBy?: string
}

// ========== Quiz Types ==========
export type Difficulty = 'easy' | 'medium' | 'hard'

export interface Question {
  id: string
  type: 'choice' | 'truefalse' | 'short_answer'
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

// ========== Annotation Types ==========
export interface AnnotationReply {
  id: string
  text: string
  createdAt: number
}

export interface Annotation {
  id: string
  documentId: string
  type: 'highlight' | 'comment'
  text: string
  comment?: string
  color: string
  xpath: {
    startContainer: string
    endContainer: string
    startOffset: number
    endOffset: number
  }
  createdAt: number
  replies?: AnnotationReply[]
}

export const HIGHLIGHT_COLORS = ['#fbbf24', '#4ecdc4', '#ff8c42', '#ff6b6b', '#a78bfa', '#326ce5'] as const

// ========== Flashcard Types ==========
export interface Flashcard {
  id: string
  annotationId: string
  documentId: string
  documentTitle: string
  front: string          // highlighted text (question side)
  back: string           // annotation content (answer side), same as front for pure highlights
  color: string          // original highlight color
  type: 'highlight' | 'comment'
  sourceDeleted?: boolean // true when the source annotation has been deleted

  // SM-2 scheduling fields
  interval: number       // days until next review
  repetition: number     // consecutive correct count
  efactor: number        // easiness factor (≥1.3)
  nextReview: number     // next review timestamp
  lastReview: number     // last review timestamp
  createdAt: number
}

// ========== Concept Card Types ==========
export interface ConceptCard {
  id: string
  conceptName: string
  definition: string
  examples: string[]
  relatedConcepts: string[]
  sourceDocId: string
  sourceSection?: string
  createdAt: number

  // SM-2 scheduling fields
  interval: number
  repetition: number
  efactor: number
  nextReview: number
  lastReview: number
}

// ========== Presentation Types ==========
export interface Presentation {
  id: string                 // pres-${Date.now()}
  documentId: string
  documentTitle: string
  slideOrder: number[]       // ordered section indices
  speakerNotes: Record<number, string>
  createdAt: number
  updatedAt: number
}

// ========== Imported Document Types ==========
export interface ImportedDocumentRecord {
  id: string
  fileName: string
  source: Source
  category: string
  importedAt: number
  title?: string
  wordCount?: number
  language?: string
}

// ========== User Preferences ==========
export interface UserPreferences {
  theme: 'light' | 'dark'
  quizDifficulty: Difficulty
  quizQuestionCount: number
  sidebarCollapsed: boolean
  aiApiUrl: string
  aiModel: string
  aiApiKey: string
  activeWorkspace: Source
  conceptMaxCount: number
  enablePresentation: boolean
}


// ========== Source Type ==========
export type Source = string

// ========== Workspace Config ==========
export type WorkspaceEntry = WorkspaceConfig

export interface WorkspaceConfig {
  id: string
  label: string
  icon: string
  path: string
  prefix: string
  shortLabel?: string
  subtitle?: string
  gradientClass?: string
  color?: string
  colorBg?: string
}

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
  isDeprecated?: boolean
  rating?: number
  lastReadAt?: number
  readCount: number
  indexedAt?: number
  url?: string
  fileType?: 'html' | 'image'
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
  rating?: number
  sortBy?: string
}

// ========== Quiz Types ==========
export type Difficulty = 'easy' | 'medium' | 'hard'
export type QuestionType = 'choice' | 'truefalse' | 'short_answer' | 'fill_blank' | 'code_completion'

export interface Question {
  id: string
  type: QuestionType
  difficulty: Difficulty
  text: string
  options?: string[] // for choice questions
  correctAnswer: string
  explanation: string
  codeSnippet?: string   // For code_completion: code with ___ blank
  placeholder?: string   // For fill_blank: input hint
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

// ========== Architecture Diagram Types ==========
export interface SavedDiagram {
  id: string
  documentId: string
  url: string
  thumbnail: string
  title: string
  topic: string
  savedAt: number
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
  url?: string
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
  quizEnabledTypes: QuestionType[]
  diagramSearchEngine?: 'google' | 'bing'
}

// ========== Concept Challenge Types ==========
export interface ChallengeRound {
  id: string
  challenge: string
  userResponse: string
  feedback: string
  score: number  // 0-100
  timestamp: number
}

export interface ConceptChallenge {
  id: string
  documentId: string
  concept: string
  rounds: ChallengeRound[]
  totalScore: number
  completedAt: number | null
  createdAt: number
}


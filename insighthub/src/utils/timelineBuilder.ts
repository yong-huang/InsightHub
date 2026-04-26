import { storageService } from '@/services/storageService'
import { ACHIEVEMENTS } from '@/services/achievementService'
import type { Document, Annotation, QuizAttempt, Flashcard } from '@/types'

export interface TimelineEntry {
  id: string
  type: 'read' | 'annotation' | 'quiz' | 'review' | 'achievement'
  timestamp: number
  documentId?: string
  summary: string
  detail?: string
  color: string
}

export type TimelineTypeFilter = 'all' | 'read' | 'annotation' | 'quiz' | 'review' | 'achievement'

const TYPE_COLORS: Record<string, string> = {
  read: '#326ce5',
  annotation: '#fbbf24',
  quiz: '#4ecdc4',
  review: '#a78bfa',
  achievement: '#ef4444',
}

function buildReadEntries(documents: Map<string, Document>): TimelineEntry[] {
  const history = storageService.getReadHistory()
  return history.map(h => {
    const doc = documents.get(h.documentId)
    return {
      id: `read-${h.documentId}-${h.readAt}`,
      type: 'read' as const,
      timestamp: h.readAt,
      documentId: h.documentId,
      summary: doc ? `Read "${doc.title}"` : 'Read a document',
      color: TYPE_COLORS.read,
    }
  })
}

function buildAnnotationEntries(annotations: Annotation[], documents: Map<string, Document>): TimelineEntry[] {
  return annotations.map(ann => {
    const doc = documents.get(ann.documentId)
    const action = ann.type === 'comment' ? 'added a comment' : 'added a highlight'
    const detail = ann.comment
      ? ann.comment.length > 80 ? ann.comment.slice(0, 80) + '...' : ann.comment
      : ann.text.length > 80 ? ann.text.slice(0, 80) + '...' : ann.text
    return {
      id: `ann-${ann.id}`,
      type: 'annotation' as const,
      timestamp: ann.createdAt,
      documentId: ann.documentId,
      summary: doc ? `${action} in "${doc.title}"` : action,
      detail,
      color: TYPE_COLORS.annotation,
    }
  })
}

function buildQuizEntries(quizHistory: QuizAttempt[], documents: Map<string, Document>): TimelineEntry[] {
  return quizHistory.map(attempt => {
    const doc = documents.get(attempt.documentId)
    const pct = attempt.maxScore > 0 ? Math.round(attempt.totalScore / attempt.maxScore * 100) : 0
    return {
      id: `quiz-${attempt.id}`,
      type: 'quiz' as const,
      timestamp: attempt.completedAt,
      documentId: attempt.documentId,
      summary: doc ? `Completed quiz for "${doc.title}"` : 'Completed a quiz',
      detail: `Score ${pct}% (${attempt.totalScore}/${attempt.maxScore})`,
      color: TYPE_COLORS.quiz,
    }
  })
}

function buildReviewEntries(flashcards: Flashcard[]): TimelineEntry[] {
  return flashcards
    .filter(c => c.lastReview > 0)
    .map(c => ({
      id: `review-${c.id}-${c.lastReview}`,
      type: 'review' as const,
      timestamp: c.lastReview,
      documentId: c.documentId,
      summary: `Reviewed flashcard for "${c.documentTitle}"`,
      detail: c.front.length > 60 ? c.front.slice(0, 60) + '...' : c.front,
      color: TYPE_COLORS.review,
    }))
}

function buildAchievementEntries(): TimelineEntry[] {
  const state = storageService.getAchievementState()
  return state.unlockedIds.map((id: string) => {
    const def = ACHIEVEMENTS.find(a => a.id === id)
    return {
      id: `ach-${id}`,
      type: 'achievement' as const,
      timestamp: state.unlockedAt[id] || Date.now(),
      summary: def ? `Unlocked achievement "${def.name}"` : 'Unlocked an achievement',
      detail: def?.description,
      color: TYPE_COLORS.achievement,
    }
  })
}

export interface TimelineOptions {
  source?: string
  typeFilter?: TimelineTypeFilter
  limit?: number
}

export function buildTimeline(
  documents: Map<string, Document>,
  annotations: Annotation[],
  quizHistory: QuizAttempt[],
  flashcards: Flashcard[],
  options: TimelineOptions = {},
): TimelineEntry[] {
  const { source = 'all', typeFilter = 'all', limit = 200 } = options

  let entries: TimelineEntry[] = []

  if (typeFilter === 'all' || typeFilter === 'read') {
    entries.push(...buildReadEntries(documents))
  }
  if (typeFilter === 'all' || typeFilter === 'annotation') {
    entries.push(...buildAnnotationEntries(annotations, documents))
  }
  if (typeFilter === 'all' || typeFilter === 'quiz') {
    entries.push(...buildQuizEntries(quizHistory, documents))
  }
  if (typeFilter === 'all' || typeFilter === 'review') {
    entries.push(...buildReviewEntries(flashcards))
  }
  if (typeFilter === 'all' || typeFilter === 'achievement') {
    entries.push(...buildAchievementEntries())
  }

  // Filter by source
  if (source !== 'all') {
    entries = entries.filter(e => {
      if (!e.documentId) return true
      const doc = documents.get(e.documentId)
      return doc?.source === source
    })
  }

  // Deduplicate entries with identical ids (e.g. multiple reads at same timestamp)
  const seen = new Set<string>()
  entries = entries.filter(e => {
    if (seen.has(e.id)) return false
    seen.add(e.id)
    return true
  })

  // Sort by timestamp descending
  entries.sort((a, b) => b.timestamp - a.timestamp)

  return entries.slice(0, limit)
}

export interface DateGroup {
  date: string
  label: string
  entries: TimelineEntry[]
}

export function groupByDate(entries: TimelineEntry[]): DateGroup[] {
  const groups = new Map<string, TimelineEntry[]>()

  for (const entry of entries) {
    const d = new Date(entry.timestamp)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    let group = groups.get(key)
    if (!group) {
      group = []
      groups.set(key, group)
    }
    group.push(entry)
  }

  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`

  return Array.from(groups.entries()).map(([date, entries]) => {
    let label = date
    if (date === todayKey) label = 'Today'
    else if (date === yesterdayKey) label = 'Yesterday'
    return { date, label, entries }
  })
}

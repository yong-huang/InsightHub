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
      summary: doc ? `阅读了「${doc.title}」` : '阅读了一篇文档',
      color: TYPE_COLORS.read,
    }
  })
}

function buildAnnotationEntries(annotations: Annotation[], documents: Map<string, Document>): TimelineEntry[] {
  return annotations.map(ann => {
    const doc = documents.get(ann.documentId)
    const action = ann.type === 'comment' ? '添加了批注' : '添加了高亮'
    const detail = ann.comment
      ? ann.comment.length > 80 ? ann.comment.slice(0, 80) + '...' : ann.comment
      : ann.text.length > 80 ? ann.text.slice(0, 80) + '...' : ann.text
    return {
      id: `ann-${ann.id}`,
      type: 'annotation' as const,
      timestamp: ann.createdAt,
      documentId: ann.documentId,
      summary: doc ? `在「${doc.title}」${action}` : action,
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
      summary: doc ? `完成了「${doc.title}」测验` : '完成了一次测验',
      detail: `得分 ${pct}%（${attempt.totalScore}/${attempt.maxScore}）`,
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
      summary: `复习了「${c.documentTitle}」的记忆卡片`,
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
      summary: def ? `解锁成就「${def.name}」` : '解锁了一个成就',
      detail: def?.description,
      color: TYPE_COLORS.achievement,
    }
  })
}

export interface TimelineOptions {
  source?: 'mindinsight' | 'techinsight' | 'all'
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
    if (date === todayKey) label = '今天'
    else if (date === yesterdayKey) label = '昨天'
    return { date, label, entries }
  })
}

import type { Document, Annotation, QuizAttempt, Tag } from '@/types'
import type { ReadHistoryEntry } from '@/services/storageService'

export type ReportPeriod = 'month' | 'year' | 'all'

export interface ReportOverview {
  readDocs: number
  totalWords: number
  activeDays: number
  achievements: number
  quizCount: number
  annotationCount: number
}

export interface CategoryDistItem {
  name: string
  read: number
  words: number
}

export interface QuizPerfData {
  avgScore: number
  maxScore: number
  difficultyDist: { difficulty: string; count: number }[]
  scoreTrend: { date: string; score: number }[]
}

export interface TopEngagedDoc {
  id: string
  title: string
  category: string
  source: string
  count: number
}

export interface ReadingHabitsData {
  hourlyDist: { hour: number; count: number }[]
  weekdayAvg: { day: string; label: string; weekday: number; weekend: number }[]
  currentStreak: number
  longestStreak: number
}

export interface TagCloudItem {
  id: string
  name: string
  color: string
  count: number
}

export interface ReportData {
  overview: ReportOverview
  categoryDistribution: CategoryDistItem[]
  readHistory: ReadHistoryEntry[]
  quizPerformance: QuizPerfData
  topAnnotated: TopEngagedDoc[]
  topQuizzed: TopEngagedDoc[]
  readingHabits: ReadingHabitsData
  tagCloud: TagCloudItem[]
}

function getPeriodStart(period: ReportPeriod): number {
  const now = new Date()
  if (period === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  }
  if (period === 'year') {
    return new Date(now.getFullYear(), 0, 1).getTime()
  }
  return 0
}

export function buildReportData(
  documents: Map<string, Document>,
  tags: Tag[],
  quizHistory: QuizAttempt[],
  annotations: Annotation[],
  readHistory: ReadHistoryEntry[],
  achievementState: { unlockedIds: string[]; unlockedAt: Record<string, number> },
  period: ReportPeriod,
  source?: string,
): ReportData {
  const start = getPeriodStart(period)

  // Build a set of doc IDs belonging to the current workspace
  const workspaceDocIds = source
    ? new Set(Array.from(documents.values()).filter(d => d.source === source).map(d => d.id))
    : null

  const allDocs = workspaceDocIds
    ? Array.from(documents.values()).filter(d => workspaceDocIds.has(d.id))
    : Array.from(documents.values())

  // Filter read history by period and workspace
  const filteredReadHistory = readHistory.filter(e => {
    if (e.readAt < start) return false
    if (workspaceDocIds && !workspaceDocIds.has(e.documentId)) return false
    return true
  })
  const readDocIds = new Set(filteredReadHistory.map(e => e.documentId))

  // Filter quiz history by period and workspace
  const filteredQuizzes = quizHistory.filter(q => {
    if (q.completedAt < start) return false
    if (workspaceDocIds && !workspaceDocIds.has(q.documentId)) return false
    return true
  })

  // Filter annotations by period and workspace
  const filteredAnnotations = annotations.filter(a => {
    if (a.createdAt < start) return false
    if (workspaceDocIds && !workspaceDocIds.has(a.documentId)) return false
    return true
  })

  // Count active days
  const activeDaysSet = new Set(filteredReadHistory.map(e => {
    const d = new Date(e.readAt)
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  }))

  // Achievements unlocked in period
  const achievementCount = period === 'all'
    ? achievementState.unlockedIds.length
    : Object.values(achievementState.unlockedAt).filter(ts => ts >= start).length

  // Overview
  const overview: ReportOverview = {
    readDocs: readDocIds.size,
    totalWords: allDocs.filter(d => readDocIds.has(d.id)).reduce((s, d) => s + d.wordCount, 0),
    activeDays: activeDaysSet.size,
    achievements: achievementCount,
    quizCount: filteredQuizzes.length,
    annotationCount: filteredAnnotations.length,
  }

  // Category distribution (only read docs in period)
  const catMap = new Map<string, { read: number; words: number }>()
  for (const doc of allDocs) {
    if (!readDocIds.has(doc.id)) continue
    const c = catMap.get(doc.category) || { read: 0, words: 0 }
    c.read++
    c.words += doc.wordCount
    catMap.set(doc.category, c)
  }
  const categoryDistribution = Array.from(catMap.entries()).map(([key, val]) => ({
    name: key,
    read: val.read,
    words: val.words,
  })).sort((a, b) => b.read - a.read)

  // Quiz performance
  const difficultyMap = new Map<string, number>()
  const scoreByDate = new Map<string, number[]>()
  let maxScore = 0
  for (const q of filteredQuizzes) {
    const pct = q.maxScore > 0 ? (q.totalScore / q.maxScore) * 100 : 0
    if (pct > maxScore) maxScore = pct
    const date = new Date(q.completedAt)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    if (!scoreByDate.has(key)) scoreByDate.set(key, [])
    scoreByDate.get(key)!.push(pct)
  }
  const avgScore = filteredQuizzes.length > 0
    ? filteredQuizzes.reduce((s, q) => s + (q.maxScore > 0 ? (q.totalScore / q.maxScore) * 100 : 0), 0) / filteredQuizzes.length
    : 0

  const quizPerformance: QuizPerfData = {
    avgScore,
    maxScore,
    difficultyDist: [
      { difficulty: '简单', count: difficultyMap.get('easy') || 0 },
      { difficulty: '中等', count: difficultyMap.get('medium') || 0 },
      { difficulty: '困难', count: difficultyMap.get('hard') || 0 },
    ],
    scoreTrend: Array.from(scoreByDate.entries())
      .map(([date, scores]) => ({ date, score: scores.reduce((s, v) => s + v, 0) / scores.length }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  }

  // Top annotated docs
  const annotatedByDoc = new Map<string, number>()
  for (const a of filteredAnnotations) {
    annotatedByDoc.set(a.documentId, (annotatedByDoc.get(a.documentId) || 0) + 1)
  }
  const topAnnotated: TopEngagedDoc[] = Array.from(annotatedByDoc.entries())
    .map(([id, count]) => {
      const doc = documents.get(id)
      return { id, title: doc?.title || id, category: doc?.category || '', source: doc?.source || '', count }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // Top quizzed docs
  const quizzedByDoc = new Map<string, number>()
  for (const q of filteredQuizzes) {
    quizzedByDoc.set(q.documentId, (quizzedByDoc.get(q.documentId) || 0) + 1)
  }
  const topQuizzed: TopEngagedDoc[] = Array.from(quizzedByDoc.entries())
    .map(([id, count]) => {
      const doc = documents.get(id)
      return { id, title: doc?.title || id, category: doc?.category || '', source: doc?.source || '', count }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // Reading habits
  const hourlyDist = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }))
  for (const e of filteredReadHistory) {
    const h = new Date(e.readAt).getHours()
    hourlyDist[h].count++
  }

  const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const weekdayAvg = dayNames.map((label, i) => ({ day: String(i), label, weekday: 0, weekend: 0 }))
  const dayReadCounts: Record<string, number[]> = {}
  for (const e of filteredReadHistory) {
    const d = new Date(e.readAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!dayReadCounts[key]) dayReadCounts[key] = []
    dayReadCounts[key].push(e.readAt)
  }
  for (const [dateKey, reads] of Object.entries(dayReadCounts)) {
    const d = new Date(dateKey)
    const dow = d.getDay()
    const count = reads.length
    if (dow === 0 || dow === 6) {
      weekdayAvg[dow].weekend += count
    } else {
      weekdayAvg[dow].weekday += count
    }
  }

  // Streaks
  const activeDates = new Set(
    filteredReadHistory.map(e => {
      const d = new Date(e.readAt)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }).sort()
  )
  const sortedDates = Array.from(activeDates).sort()

  let currentStreak = 0
  let longestStreak = 0
  let tempStreak = 1

  if (sortedDates.length > 0) {
    const today = new Date()
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`

    if (sortedDates.includes(todayKey) || sortedDates.includes(yesterdayKey)) {
      currentStreak = 1
      const checkDate = sortedDates.includes(todayKey) ? new Date(today) : new Date(yesterday)
      while (true) {
        checkDate.setDate(checkDate.getDate() - 1)
        const prevKey = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`
        if (sortedDates.includes(prevKey)) {
          currentStreak++
        } else {
          break
        }
      }
    }

    for (let i = 1; i < sortedDates.length; i++) {
      const prev = new Date(sortedDates[i - 1])
      const curr = new Date(sortedDates[i])
      const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
      if (diff === 1) {
        tempStreak++
      } else {
        if (tempStreak > longestStreak) longestStreak = tempStreak
        tempStreak = 1
      }
    }
    if (tempStreak > longestStreak) longestStreak = tempStreak
  }

  const readingHabits: ReadingHabitsData = {
    hourlyDist,
    weekdayAvg,
    currentStreak,
    longestStreak,
  }

  // Tag cloud
  const tagCounts = new Map<string, number>()
  for (const tag of tags) {
    const relevantDocs = tag.documentIds.filter(id => readDocIds.has(id))
    if (relevantDocs.length > 0) {
      tagCounts.set(tag.id, relevantDocs.length)
    }
  }
  const tagCloud: TagCloudItem[] = tags
    .filter(t => tagCounts.has(t.id))
    .map(t => ({ id: t.id, name: t.name, color: t.color, count: tagCounts.get(t.id)! }))
    .sort((a, b) => b.count - a.count)

  return {
    overview,
    categoryDistribution,
    readHistory: filteredReadHistory,
    quizPerformance,
    topAnnotated,
    topQuizzed,
    readingHabits,
    tagCloud,
  }
}

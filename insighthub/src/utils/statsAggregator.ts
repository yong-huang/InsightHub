import type { Document, Annotation, QuizAttempt } from '@/types'
import type { ReadHistoryEntry } from '@/services/storageService'
import { getCategoryInfo } from '@/utils/categoryMap'

// ===== Heatmap (last 52 weeks / full year) =====

export interface HeatmapCell {
  date: string       // YYYY-MM-DD
  count: number
  level: 0 | 1 | 2 | 3 | 4
}

export function buildHeatmapData(
  entries: ReadHistoryEntry[],
  documents: Map<string, Document>,
  source?: string,
): { cells: HeatmapCell[]; weeks: string[][] } {
  const filtered = filterBySource(entries, documents, source)
  const countsByDate = new Map<string, number>()
  for (const entry of filtered) {
    const date = formatDate(new Date(entry.readAt))
    countsByDate.set(date, (countsByDate.get(date) || 0) + 1)
  }

  // Full year ending today
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const endDate = new Date(today)
  const startDate = new Date(today)
  startDate.setDate(startDate.getDate() - 52 * 7)

  const cells: HeatmapCell[] = []
  const maxCount = Math.max(1, ...Array.from(countsByDate.values()))

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const key = formatDate(d)
    const count = countsByDate.get(key) || 0
    let level: 0 | 1 | 2 | 3 | 4 = 0
    if (count > 0) {
      const ratio = count / maxCount
      if (ratio >= 0.75) level = 4
      else if (ratio >= 0.5) level = 3
      else if (ratio >= 0.25) level = 2
      else level = 1
    }
    cells.push({ date: key, count, level })
  }

  // Arrange into weeks (columns), starting from the same weekday as start
  const startDow = startDate.getDay() // 0=Sun
  const weeks: string[][] = []
  let currentWeek: string[] = []

  // Pad the first week
  for (let i = 0; i < startDow; i++) {
    currentWeek.push('')
  }

  for (const cell of cells) {
    currentWeek.push(cell.date)
    if (currentWeek.length === 7) {
      weeks.push(currentWeek)
      currentWeek = []
    }
  }
  if (currentWeek.length > 0) {
    weeks.push(currentWeek)
  }

  return { cells, weeks }
}

// ===== Reading Trend =====

export interface TrendPoint {
  date: string
  count: number
}

export function buildReadingTrend(
  entries: ReadHistoryEntry[],
  documents: Map<string, Document>,
  source?: string,
  mode: 'daily' | 'weekly' = 'daily',
): TrendPoint[] {
  const filtered = filterBySource(entries, documents, source)
  const countsByDate = new Map<string, number>()
  for (const entry of filtered) {
    const date = formatDate(new Date(entry.readAt))
    countsByDate.set(date, (countsByDate.get(date) || 0) + 1)
  }

  if (mode === 'weekly') {
    return aggregateWeekly(countsByDate)
  }

  // Daily: last 30 days
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const result: TrendPoint[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = formatDate(d)
    result.push({ date: key, count: countsByDate.get(key) || 0 })
  }
  return result
}

// ===== Category Completion =====

export interface CategoryCompletionItem {
  name: string
  read: number
  total: number
  rate: number
}

export function buildCategoryCompletion(
  documents: Map<string, Document>,
  source?: string,
): CategoryCompletionItem[] {
  const cats = new Map<string, { read: number; total: number }>()
  for (const doc of documents.values()) {
    if (source && doc.source !== source) continue
    if (!cats.has(doc.category)) {
      cats.set(doc.category, { read: 0, total: 0 })
    }
    const c = cats.get(doc.category)!
    c.total++
    if (doc.isRead) c.read++
  }

  return Array.from(cats.entries()).map(([key, { read, total }]) => {
    const info = getCategoryInfo(key)
    return {
      name: info?.label || key,
      read,
      total,
      rate: total > 0 ? read / total : 0,
    }
  }).sort((a, b) => b.total - a.total)
}

// ===== Quiz Score Trend =====

export interface QuizScorePoint {
  date: string
  avgScore: number
  count: number
}

export function buildQuizScoreTrend(
  attempts: QuizAttempt[],
  documents: Map<string, Document>,
  source?: string,
): QuizScorePoint[] {
  const docIds = source
    ? new Set(Array.from(documents.values()).filter(d => d.source === source).map(d => d.id))
    : null

  const filtered = docIds
    ? attempts.filter(a => docIds.has(a.documentId))
    : attempts

  // Group by date
  const byDate = new Map<string, { scores: number[]; count: number }>()
  for (const a of filtered) {
    const key = formatDate(new Date(a.completedAt))
    if (!byDate.has(key)) byDate.set(key, { scores: [], count: 0 })
    const group = byDate.get(key)!
    const pct = a.maxScore > 0 ? (a.totalScore / a.maxScore) * 100 : 0
    group.scores.push(pct)
    group.count++
  }

  return Array.from(byDate.entries())
    .map(([date, { scores, count }]) => ({
      date,
      avgScore: scores.reduce((s, v) => s + v, 0) / scores.length,
      count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ===== Annotation Stats =====

export interface AnnotationStatsResult {
  total: number
  highlightCount: number
  commentCount: number
  colorDistribution: { color: string; count: number }[]
  docsWithAnnotations: number
}

export function buildAnnotationStats(
  annotations: Annotation[],
  documents: Map<string, Document>,
  source?: string,
): AnnotationStatsResult {
  const docIds = source
    ? new Set(Array.from(documents.values()).filter(d => d.source === source).map(d => d.id))
    : null

  const filtered = docIds
    ? annotations.filter(a => docIds.has(a.documentId))
    : annotations

  const highlightCount = filtered.filter(a => a.type === 'highlight').length
  const commentCount = filtered.filter(a => a.type === 'comment').length

  const colorMap = new Map<string, number>()
  for (const a of filtered) {
    colorMap.set(a.color, (colorMap.get(a.color) || 0) + 1)
  }

  const annotatedDocIds = new Set(filtered.map(a => a.documentId))

  return {
    total: filtered.length,
    highlightCount,
    commentCount,
    colorDistribution: Array.from(colorMap.entries())
      .map(([color, count]) => ({ color, count }))
      .sort((a, b) => b.count - a.count),
    docsWithAnnotations: annotatedDocIds.size,
  }
}

// ===== Word Count Distribution =====

export interface WordCountBucket {
  range: string
  count: number
}

export function buildWordCountDist(
  documents: Map<string, Document>,
  source?: string,
): WordCountBucket[] {
  const docs = source
    ? Array.from(documents.values()).filter(d => d.source === source)
    : Array.from(documents.values())

  const ranges = [
    { min: 0, max: 2000, label: '< 2k' },
    { min: 2000, max: 5000, label: '2k-5k' },
    { min: 5000, max: 10000, label: '5k-10k' },
    { min: 10000, max: 20000, label: '10k-20k' },
    { min: 20000, max: 50000, label: '20k-50k' },
    { min: 50000, max: Infinity, label: '> 50k' },
  ]

  return ranges.map(r => ({
    range: r.label,
    count: docs.filter(d => d.wordCount >= r.min && d.wordCount < r.max).length,
  }))
}

// ===== Helpers =====

function filterBySource(
  entries: ReadHistoryEntry[],
  documents: Map<string, Document>,
  source?: string,
): ReadHistoryEntry[] {
  if (!source) return entries
  const docIds = new Set(Array.from(documents.values()).filter(d => d.source === source).map(d => d.id))
  return entries.filter(e => docIds.has(e.documentId))
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function aggregateWeekly(countsByDate: Map<string, number>): TrendPoint[] {
  const weekMap = new Map<string, { date: string; count: number }>()

  for (const [date, count] of countsByDate) {
    const d = new Date(date)
    // Get Monday of the week
    const dow = d.getDay()
    const mondayOffset = dow === 0 ? -6 : 1 - dow
    const monday = new Date(d)
    monday.setDate(d.getDate() + mondayOffset)
    const key = formatDate(monday)

    if (!weekMap.has(key)) {
      weekMap.set(key, { date: key, count: 0 })
    }
    weekMap.get(key)!.count += count
  }

  return Array.from(weekMap.values()).sort((a, b) => a.date.localeCompare(b.date))
}

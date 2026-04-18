import type { Document, Source } from '@/types'
import { CATEGORIES, type Workspace } from '@/utils/categoryMap'

export interface PathMilestone {
  categoryKey: string
  label: string
  source: Source
  icon: string
  readCount: number
  totalCount: number
  progress: number
  isNextRecommended: boolean
}

export interface PathData {
  mindinsight: PathMilestone[]
  techinsight: PathMilestone[]
  leetcodeinsight: PathMilestone[]
  overallProgress: number
  nextRecommendations: PathMilestone[]
}

export function buildPathData(documents: Map<string, Document>, source?: string): PathData {
  const allDocs = Array.from(documents.values()).filter(d => !source || d.source === source)
  const results: Record<string, PathMilestone> = {}

  for (const cat of CATEGORIES) {
    const catDocs = allDocs.filter(d => d.category === cat.key)
    const readDocs = catDocs.filter(d => d.isRead)
    const total = catDocs.length
    const read = readDocs.length
    results[cat.key] = {
      categoryKey: cat.key,
      label: cat.label,
      source: cat.source,
      icon: cat.icon,
      readCount: read,
      totalCount: total,
      progress: total > 0 ? read / total : 0,
      isNextRecommended: false,
    }
  }

  // Mark next recommended (first incomplete category per source)
  const markRecommended = (source: Source) => {
    const sourceCategories = CATEGORIES.filter(c => c.source === source)
    const sorted = sourceCategories
      .map(c => results[c.key])
      .sort((a, b) => b.progress - a.progress)

    for (const m of sorted) {
      if (m.progress < 1) {
        m.isNextRecommended = true
        break
      }
    }
  }

  markRecommended('mindinsight')
  markRecommended('techinsight')
  markRecommended('leetcodeinsight')

  const mindinsight = CATEGORIES.filter(c => c.source === 'mindinsight')
    .map(c => results[c.key])
    .sort((a, b) => b.progress - a.progress)

  const techinsight = CATEGORIES.filter(c => c.source === 'techinsight')
    .map(c => results[c.key])
    .sort((a, b) => b.progress - a.progress)

  const leetcodeinsight = CATEGORIES.filter(c => c.source === 'leetcodeinsight')
    .map(c => results[c.key])
    .sort((a, b) => b.progress - a.progress)

  // Overall progress
  const totalDocs = allDocs.length
  const totalRead = allDocs.filter(d => d.isRead).length
  const overallProgress = totalDocs > 0 ? totalRead / totalDocs : 0

  const nextRecommendations = Object.values(results).filter(m => m.isNextRecommended)

  return { mindinsight, techinsight, leetcodeinsight, overallProgress, nextRecommendations }
}

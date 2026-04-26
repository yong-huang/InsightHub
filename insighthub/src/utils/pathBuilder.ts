import type { Document, Source } from '@/types'
import { getCategoryInfo } from '@/utils/categoryMap'

/** Derive unique categories from documents */
function deriveCategories(docs: Document[]): { key: string; label: string; source: Source; icon: string }[] {
  const seen = new Set<string>()
  const result: { key: string; label: string; source: Source; icon: string }[] = []
  for (const doc of docs) {
    if (!doc.category || seen.has(doc.category)) continue
    seen.add(doc.category)
    const info = getCategoryInfo(doc.category)
    result.push({ key: doc.category, label: info.label, source: info.source, icon: info.icon })
  }
  return result
}

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
  workspaces: Record<string, PathMilestone[]>
  overallProgress: number
  nextRecommendations: PathMilestone[]
}

export function buildPathData(documents: Map<string, Document>, source?: string): PathData {
  const allDocs = Array.from(documents.values()).filter(d => !source || d.source === source)
  const derivedCategories = deriveCategories(allDocs)
  const results: Record<string, PathMilestone> = {}

  for (const cat of derivedCategories) {
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
  const seenSources = new Set<string>()
  for (const cat of derivedCategories) {
    if (!seenSources.has(cat.source)) {
      seenSources.add(cat.source)
      const sourceCategories = derivedCategories.filter(c => c.source === cat.source)
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
  }

  // Build per-workspace milestone lists
  const workspaceMilestones: Record<string, PathMilestone[]> = {}
  for (const cat of derivedCategories) {
    if (!workspaceMilestones[cat.source]) {
      workspaceMilestones[cat.source] = []
    }
    workspaceMilestones[cat.source].push(results[cat.key])
  }
  // Sort each workspace by progress descending
  for (const key of Object.keys(workspaceMilestones)) {
    workspaceMilestones[key].sort((a, b) => b.progress - a.progress)
  }

  // Overall progress
  const totalDocs = allDocs.length
  const totalRead = allDocs.filter(d => d.isRead).length
  const overallProgress = totalDocs > 0 ? totalRead / totalDocs : 0

  const nextRecommendations = Object.values(results).filter(m => m.isNextRecommended)

  return { workspaces: workspaceMilestones, overallProgress, nextRecommendations }
}

import type { Source, WorkspaceConfig } from '@/types'

export interface CategoryEntry {
  key: string
  label: string
  source: Source
  icon: string
}

export type Workspace = Source

/** @deprecated Use workspaceUtils.getWorkspaceConfig() instead */
export const DEFAULT_WORKSPACE_META: Record<string, { label: string; subtitle: string; icon: string; gradientClass: string; basePath: string }> = {
  mindinsight: { label: 'MindInsight', subtitle: 'Mind & Insight', icon: 'Brain', gradientClass: 'gradient-text-warm', basePath: '/mindinsight' },
  techinsight: { label: 'TechInsight', subtitle: 'Tech & Insight', icon: 'Cpu', gradientClass: 'gradient-text', basePath: '/techinsight' },
  leetcodeinsight: { label: 'LeetcodeInsight', subtitle: 'Algorithm Mastery', icon: 'Code2', gradientClass: 'gradient-text-green', basePath: '/leetcodeinsight' },
}

/** @deprecated Use workspaceUtils.getWorkspaceConfig() instead */
export const WORKSPACE_META = DEFAULT_WORKSPACE_META

/** Runtime category registry — populated from documents on init */
const dynamicCategoryMap = new Map<string, CategoryEntry>()

function titleCase(key: string): string {
  return key.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/** Register categories discovered from documents. Call once after documents load. */
export function registerDynamicCategories(entries: { key: string; source: Source }[]): void {
  for (const entry of entries) {
    if (dynamicCategoryMap.has(entry.key)) continue
    dynamicCategoryMap.set(entry.key, {
      key: entry.key,
      label: titleCase(entry.key),
      source: entry.source,
      icon: 'Folder',
    })
  }
}

/** All registered categories — only categories from actual documents appear here */
export function getRegisteredCategories(): CategoryEntry[] {
  return Array.from(dynamicCategoryMap.values())
}

/** Never returns undefined — always returns a CategoryEntry with titleCase fallback */
export function getCategoryInfo(key: string): CategoryEntry {
  const dynamic = dynamicCategoryMap.get(key)
  if (dynamic) return dynamic
  return { key, label: titleCase(key), source: 'techinsight' as Source, icon: 'Folder' }
}

/** @deprecated Use useDynamicCategories hook instead */
export function getCategoriesBySource(source: Source): CategoryEntry[] {
  return getRegisteredCategories().filter(c => c.source === source)
}

const SOURCE_LABELS: Record<string, string> = {
  mindinsight: 'MindInsight · Mind & Insight',
  techinsight: 'TechInsight · Tech & Insight',
  leetcodeinsight: 'LeetcodeInsight · Algorithm Mastery',
}

export function getSourceLabel(source: Source): string {
  const entry = SOURCE_LABELS[source]
  if (entry) return entry
  return source.charAt(0).toUpperCase() + source.slice(1)
}

export function getSourceFromCategory(category: string, documents?: Map<string, { source: Source; category: string }>): Source {
  if (documents) {
    for (const doc of documents.values()) {
      if (doc.category === category) return doc.source
    }
  }
  const info = getCategoryInfo(category)
  return info.source
}

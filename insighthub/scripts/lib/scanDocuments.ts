import * as path from 'path'
import type { Source } from '../../src/types'
import { scanWithManifest } from './manifestManager'

export interface DocumentManifestEntry {
  id: string
  filePath: string
  fileName: string
  source: Source
  category: string
  subcategory?: string
}

export const EXCLUDE_DIRS = ['backups', 'template']
const EXCLUDE_FILES = ['index.html']

export function isExcluded(filePath: string): boolean {
  const parts = filePath.split(path.sep)
  for (const exclude of EXCLUDE_DIRS) {
    if (parts.includes(exclude)) return true
  }
  for (const exclude of EXCLUDE_FILES) {
    if (parts[parts.length - 1] === exclude) return true
  }
  return false
}

export function generateId(
  source: string,
  relativePath: string,
  fileName: string,
): string {
  const nameWithoutExt = fileName.replace(/\.html$/, '')
  // Use directory parts only (exclude the filename which is already handled)
  const dirParts = relativePath
    .split(path.sep)
    .filter(s => s.length > 0)
    .slice(0, -1)
    .join('-')
  return `${source}-${dirParts}-${nameWithoutExt}`
}

export const SOURCE_NAMES: Record<string, string> = {
  mindinsight: 'MindInsight',
  techinsight: 'TechInsight',
  leetcodeinsight: 'LeetcodeInsight',
}

export function scanDocuments(
  mindInsightDir: string,
  techInsightDir: string,
  leetcodeInsightDir?: string,
): DocumentManifestEntry[] {
  const result = [
    ...scanWithManifest(mindInsightDir, 'mindinsight', 'mi'),
    ...scanWithManifest(techInsightDir, 'techinsight', 'ti'),
  ]
  if (leetcodeInsightDir) {
    result.push(...scanWithManifest(leetcodeInsightDir, 'leetcodeinsight', 'li'))
  }
  return result
}

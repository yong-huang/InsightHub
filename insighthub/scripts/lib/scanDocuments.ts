import * as path from 'path'
import type { Source, WorkspaceEntry } from '../../src/types'
import { scanWithManifest } from './manifestManager'
export { scanWithManifest }

export interface DocumentManifestEntry {
  id: string
  filePath: string
  fileName: string
  source: Source
  category: string
  subcategory?: string
  // Enriched metadata (optional, backward-compatible)
  title?: string
  contentSnippet?: string
  wordCount?: number
  language?: 'zh' | 'en' | 'mixed'
  sections?: Array<{ id: string; title: string; level: 2 | 3 }>
}

export const EXCLUDE_DIRS = ['backups', 'template']
const EXCLUDE_FILES = ['index.html']

export function isExcluded(filePath: string): boolean {
  const parts = filePath.split(path.sep)
  // Exclude hidden directories (e.g. .claude, .git, .DS_Store)
  for (const part of parts) {
    if (part.startsWith('.')) return true
  }
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

/**
 * Scan all workspaces at once, resolving relative paths against baseDir.
 */
export interface ScanOptions {
  extractMetadata?: boolean
}

export function scanWorkspaces(
  workspaces: WorkspaceEntry[],
  baseDir: string,
  options?: ScanOptions,
): DocumentManifestEntry[] {
  const result: DocumentManifestEntry[] = []
  for (const ws of workspaces) {
    if (!ws.path) continue
    const absPath = path.isAbsolute(ws.path) ? ws.path : path.resolve(baseDir, ws.path)
    // Use actual directory name (not label) for filePath to ensure case-sensitive match
    const dirName = path.basename(absPath)
    result.push(...scanWithManifest(absPath, ws.id, ws.prefix, dirName, options))
  }
  return result
}

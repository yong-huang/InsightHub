import * as path from 'path'
import type { Source, WorkspaceEntry } from '../../src/types'
import { scanWithManifest } from './manifestManager'
export { scanWithManifest }
export { generateId, generateIdWithConflictResolution } from './idGenerator'

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
  fileType?: 'html' | 'image'
}

export const EXCLUDE_DIRS = ['backups', 'template']
const EXCLUDE_FILES = ['index.html']

export const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif', '.tiff', '.tif',
])

export function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return IMAGE_EXTENSIONS.has(ext)
}

export function isDocumentFile(filePath: string): boolean {
  return filePath.endsWith('.html') || isImageFile(filePath)
}

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

import * as fs from 'fs'
import * as path from 'path'

export interface DocumentManifestEntry {
  id: string
  filePath: string
  fileName: string
  source: 'mindinsight' | 'techinsight'
  category: string
  subcategory?: string
}

const EXCLUDE_DIRS = ['backups', 'template']
const EXCLUDE_FILES = ['index.html']

function isExcluded(filePath: string): boolean {
  const parts = filePath.split(path.sep)
  for (const exclude of EXCLUDE_DIRS) {
    if (parts.includes(exclude)) return true
  }
  for (const exclude of EXCLUDE_FILES) {
    if (parts[parts.length - 1] === exclude) return true
  }
  return false
}

function generateId(
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

function scanDirectory(
  dir: string,
  source: 'mindinsight' | 'techinsight',
  sourcePrefix: string,
): DocumentManifestEntry[] {
  const entries: DocumentManifestEntry[] = []

  if (!fs.existsSync(dir)) return entries

  for (const rawEntry of fs.readdirSync(dir, { recursive: true })) {
    if (typeof rawEntry !== 'string') continue
    const absPath = path.join(dir, rawEntry)
    if (!fs.statSync(absPath).isFile()) continue
    if (!rawEntry.endsWith('.html')) continue

    const relativePath = rawEntry // readdir recursive returns relative paths from dir
    const fileName = path.basename(rawEntry)
    if (isExcluded(relativePath)) continue
    const parts = relativePath.split(path.sep).filter(s => s.length > 0)
    const category = parts[0] || ''
    const subcategory = parts.length > 2 ? parts.slice(1, -1).join(path.sep) : undefined

    const sourceName = source === 'mindinsight' ? 'MindInsight' : 'TechInsight'

    entries.push({
      id: generateId(sourcePrefix, relativePath, fileName),
      filePath: `../${sourceName}/${relativePath}`,
      fileName,
      source,
      category,
      subcategory,
    })
  }

  return entries
}

export function scanDocuments(
  mindInsightDir: string,
  techInsightDir: string,
): DocumentManifestEntry[] {
  return [
    ...scanDirectory(mindInsightDir, 'mindinsight', 'mi'),
    ...scanDirectory(techInsightDir, 'techinsight', 'ti'),
  ]
}

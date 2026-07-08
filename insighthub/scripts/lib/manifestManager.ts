import * as fs from 'fs'
import * as path from 'path'
import type { Source } from '../../src/types'
import type { DocumentManifestEntry, ScanOptions } from './scanDocuments'
import { generateId, isExcluded, isDocumentFile, isImageFile } from './scanDocuments'
import { extractHtmlMetadataFromFile, type HtmlMetadata } from './htmlMetadataExtractor'

interface ManifestEntry {
  file: string // relative path from source root
  mtime?: number // fs.statSync().mtimeMs — used to skip metadata re-extraction
  meta?: HtmlMetadata // cached metadata
}

interface Manifest {
  version: number
  entries: Record<string, ManifestEntry>
}

const MANIFEST_FILENAME = '.manifest.json'

function loadManifest(sourceDir: string): Manifest | null {
  const manifestPath = path.join(sourceDir, MANIFEST_FILENAME)
  if (!fs.existsSync(manifestPath)) return null
  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8')
    const data = JSON.parse(raw)
    if (data && typeof data.entries === 'object') return data as Manifest
  } catch {
    // Corrupted manifest — treat as missing
  }
  return null
}

function saveManifest(sourceDir: string, manifest: Manifest): void {
  const manifestPath = path.join(sourceDir, MANIFEST_FILENAME)
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8')
}

/**
 * Scan a source directory, reconciling with an existing manifest so that
 * document IDs are stable across file moves.
 *
 * Algorithm:
 * 1. Scan all .html files → Map<relativePath, fileName>
 * 2. Load existing manifest → build fileName → { id, file } index
 * 3. For each file:
 *    - If manifest already has this relativePath → reuse ID
 *    - Else if manifest has same fileName (moved file) → reuse ID, update path
 *    - Else → generate new ID
 * 4. Remove manifest entries with no corresponding file
 * 5. Write back manifest (only if changed)
 *
 * Metadata caching: when extractMetadata is enabled, cached metadata from the
 * manifest is reused if the file's mtime hasn't changed. Only changed/new
 * files incur the cost of HTML parsing.
 */
export function scanWithManifest(
  sourceDir: string,
  source: Source,
  sourcePrefix: string,
  sourceNameOverride?: string,
  options?: ScanOptions,
): DocumentManifestEntry[] {
  if (!fs.existsSync(sourceDir)) return []

  // Step 1: Scan all .html files + collect mtimes
  const scannedFiles = new Map<string, string>() // relativePath → fileName
  const fileMtimes = new Map<string, number>() // relativePath → mtimeMs
  for (const rawEntry of fs.readdirSync(sourceDir, { recursive: true })) {
    if (typeof rawEntry !== 'string') continue
    const absPath = path.join(sourceDir, rawEntry)
    const stat = fs.statSync(absPath)
    if (!stat.isFile()) continue
    if (!isDocumentFile(rawEntry)) continue
    if (isExcluded(rawEntry)) continue
    scannedFiles.set(rawEntry, path.basename(rawEntry))
    fileMtimes.set(rawEntry, stat.mtimeMs)
  }

  // Step 2: Load existing manifest
  const manifest = loadManifest(sourceDir) ?? { version: 1, entries: {} }

  // Build reverse indexes: relativePath → id, fileName → { id, file }
  const pathToId = new Map<string, string>()
  const fileNameToEntry = new Map<string, { id: string; file: string }>()
  let manifestChanged = false
  for (const [id, entry] of Object.entries(manifest.entries)) {
    // Handle corrupted entries (string instead of {file: string})
    if (!entry || typeof entry !== 'object' || typeof entry.file !== 'string') {
      manifestChanged = true // Force rewrite to fix
      continue
    }
    pathToId.set(entry.file, id)
    fileNameToEntry.set(path.basename(entry.file), { id, file: entry.file })
  }

  // Step 3: Reconcile
  const newEntries: Record<string, ManifestEntry> = {}
  const results: DocumentManifestEntry[] = []
  const sourceName = sourceNameOverride || source
  const needMeta = !!options?.extractMetadata

  for (const [relativePath, fileName] of scannedFiles) {
    let id: string

    // Exact path match → reuse ID
    if (pathToId.has(relativePath)) {
      id = pathToId.get(relativePath)!
      // Check if entry unchanged
      if (manifest.entries[id]?.file !== relativePath) manifestChanged = true
    } else {
      // Check if same fileName exists (file moved)
      const existing = fileNameToEntry.get(fileName)
      if (existing) {
        id = existing.id
        manifestChanged = true // Path changed
      } else {
        // New file → generate new ID
        id = generateId(sourcePrefix, relativePath, fileName)
        manifestChanged = true
      }
    }

    const parts = relativePath.split(path.sep).filter(s => s.length > 0)
    // parts[-1] is always the filename; if file is at root, skip it
    const dirParts = parts.length > 1 ? parts.slice(0, -1) : []
    const category = dirParts[0] || ''
    const subcategory = dirParts.length > 2 ? dirParts.slice(1).join(path.sep) : (dirParts[1] || undefined)

    const entry: DocumentManifestEntry = {
      id,
      filePath: `../${sourceName}/${relativePath}`,
      fileName,
      source,
      category,
      subcategory,
    }

    // Build manifest entry with metadata cache
    const manifestEntry: ManifestEntry = { file: relativePath }
    const currentMtime = fileMtimes.get(relativePath)!
    const oldEntry = manifest.entries[id]
    let metaChanged = false

    if (isImageFile(relativePath)) {
      // Image files: use filename as title, skip HTML metadata extraction
      entry.fileType = 'image'
      const ext = path.extname(fileName)
      entry.title = ext ? fileName.slice(0, -ext.length) : fileName
      entry.contentSnippet = ''
      entry.wordCount = 0
      entry.language = 'en'
      entry.sections = []
    } else if (needMeta) {
      // Reuse cached metadata if mtime unchanged
      if (oldEntry?.mtime === currentMtime && oldEntry?.meta) {
        entry.title = oldEntry.meta.title
        entry.contentSnippet = oldEntry.meta.contentSnippet
        entry.wordCount = oldEntry.meta.wordCount
        entry.language = oldEntry.meta.language
        entry.sections = oldEntry.meta.sections
        manifestEntry.meta = oldEntry.meta
      } else {
        // Extract metadata from file
        const absFilePath = path.join(sourceDir, relativePath)
        try {
          const meta = extractHtmlMetadataFromFile(absFilePath)
          entry.title = meta.title
          entry.contentSnippet = meta.contentSnippet
          entry.wordCount = meta.wordCount
          entry.language = meta.language
          entry.sections = meta.sections
          manifestEntry.meta = meta
          metaChanged = true
        } catch {
          // Skip metadata for unreadable files
        }
      }
      manifestEntry.mtime = currentMtime
    }

    newEntries[id] = manifestEntry
    if (metaChanged) manifestChanged = true

    results.push(entry)
  }

  // Step 4: Detect removed entries (entries not in newEntries)
  for (const id of Object.keys(manifest.entries)) {
    if (!(id in newEntries)) {
      manifestChanged = true
      break
    }
  }

  // Step 5: Write back manifest if changed
  if (manifestChanged || Object.keys(manifest.entries).length === 0) {
    saveManifest(sourceDir, { version: 1, entries: newEntries })
  }

  return results
}

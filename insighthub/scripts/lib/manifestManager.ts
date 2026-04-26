import * as fs from 'fs'
import * as path from 'path'
import type { Source } from '../../src/types'
import type { DocumentManifestEntry } from './scanDocuments'
import { generateId, isExcluded, SOURCE_NAMES } from './scanDocuments'

interface ManifestEntry {
  file: string // relative path from source root
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
 */
export function scanWithManifest(
  sourceDir: string,
  source: Source,
  sourcePrefix: string,
  sourceNameOverride?: string,
): DocumentManifestEntry[] {
  if (!fs.existsSync(sourceDir)) return []

  // Step 1: Scan all .html files
  const scannedFiles = new Map<string, string>() // relativePath → fileName
  for (const rawEntry of fs.readdirSync(sourceDir, { recursive: true })) {
    if (typeof rawEntry !== 'string') continue
    const absPath = path.join(sourceDir, rawEntry)
    if (!fs.statSync(absPath).isFile()) continue
    if (!rawEntry.endsWith('.html')) continue
    if (isExcluded(rawEntry)) continue
    scannedFiles.set(rawEntry, path.basename(rawEntry))
  }

  // Step 2: Load existing manifest
  const manifest = loadManifest(sourceDir) ?? { version: 1, entries: {} }

  // Build reverse indexes: relativePath → id, fileName → { id, file }
  const pathToId = new Map<string, string>()
  const fileNameToEntry = new Map<string, { id: string; file: string }>()
  for (const [id, entry] of Object.entries(manifest.entries)) {
    pathToId.set(entry.file, id)
    fileNameToEntry.set(path.basename(entry.file), { id, file: entry.file })
  }

  // Step 3: Reconcile
  let changed = false
  const newEntries: Record<string, ManifestEntry> = {}
  const results: DocumentManifestEntry[] = []
  const sourceName = sourceNameOverride || SOURCE_NAMES[source] || source

  for (const [relativePath, fileName] of scannedFiles) {
    let id: string

    // Exact path match → reuse ID
    if (pathToId.has(relativePath)) {
      id = pathToId.get(relativePath)!
      newEntries[id] = { file: relativePath }
      // Check if entry unchanged
      if (manifest.entries[id]?.file !== relativePath) changed = true
    } else {
      // Check if same fileName exists (file moved)
      const existing = fileNameToEntry.get(fileName)
      if (existing) {
        id = existing.id
        newEntries[id] = { file: relativePath }
        changed = true // Path changed
      } else {
        // New file → generate new ID
        id = generateId(sourcePrefix, relativePath, fileName)
        newEntries[id] = { file: relativePath }
        changed = true
      }
    }

    const parts = relativePath.split(path.sep).filter(s => s.length > 0)
    // parts[-1] is always the filename; if file is at root, skip it
    const dirParts = parts.length > 1 ? parts.slice(0, -1) : []
    const category = dirParts[0] || ''
    const subcategory = dirParts.length > 2 ? dirParts.slice(1).join(path.sep) : (dirParts[1] || undefined)

    results.push({
      id,
      filePath: `../${sourceName}/${relativePath}`,
      fileName,
      source,
      category,
      subcategory,
    })
  }

  // Step 4: Detect removed entries (entries not in newEntries)
  for (const id of Object.keys(manifest.entries)) {
    if (!(id in newEntries)) {
      changed = true
      break
    }
  }

  // Step 5: Write back manifest if changed
  if (changed || Object.keys(manifest.entries).length === 0) {
    saveManifest(sourceDir, { version: 1, entries: newEntries })
  }

  return results
}

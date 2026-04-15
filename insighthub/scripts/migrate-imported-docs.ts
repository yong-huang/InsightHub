/**
 * One-time migration script: move all imported documents to TechInsight directories.
 *
 * Usage: cd insighthub && npx tsx scripts/migrate-imported-docs.ts
 *
 * What it does:
 * 1. Reads all entries from .insighthub-imported-docs.json
 * 2. Moves HTML files from .insighthub-imports/ to TechInsight/<category>/
 * 3. Rewrites all JSON data files to map old imported- IDs to new ti- IDs
 * 4. Cleans up .insighthub-imported-docs.json
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const BASE_DIR = path.resolve(__dirname, '..')
const TECHINSIGHT_DIR = path.resolve(BASE_DIR, '../../TechInsight')
const IMPORTS_DIR = path.join(BASE_DIR, '.insighthub-imports')
const IMPORTED_DOCS_JSON = path.join(BASE_DIR, '.insighthub-imported-docs.json')

// ── Helpers ──────────────────────────────────────────────────────────────────

interface ImportedDocRecord {
  id: string
  fileName: string
  source: 'mindinsight' | 'techinsight'
  category: string
  importedAt: number
  encrypted?: boolean
  title?: string
  wordCount?: number
  language?: string
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

/** Generate the new ID matching what scanDocuments would produce */
function generateNewId(category: string, fileName: string): string {
  const nameWithoutExt = fileName.replace(/\.html$/, '')
  return `ti-${category}-${nameWithoutExt}`
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  console.log('Migrating imported documents...')
  console.log(`TechInsight dir: ${TECHINSIGHT_DIR}`)
  console.log(`Imports dir:     ${IMPORTS_DIR}`)

  if (!fs.existsSync(TECHINSIGHT_DIR)) {
    console.error(`ERROR: TechInsight directory not found: ${TECHINSIGHT_DIR}`)
    process.exit(1)
  }

  if (!fs.existsSync(IMPORTED_DOCS_JSON)) {
    console.log('No imported docs found. Nothing to do.')
    return
  }

  const docs = readJson(IMPORTED_DOCS_JSON) as ImportedDocRecord[]
  if (docs.length === 0) {
    console.log('No imported docs found. Nothing to do.')
    return
  }
  console.log(`Found ${docs.length} imported documents\n`)

  // Build ID map
  const idMap: Record<string, string> = {}
  for (const doc of docs) {
    idMap[doc.id] = generateNewId(doc.category, doc.fileName)
  }

  const replaceId = (id: string): string => idMap[id] ?? id

  // ── Step 1: Move files ─────────────────────────────────────────────────────

  console.log('=== Step 1: Move files from .insighthub-imports/ to TechInsight/ ===')
  for (const doc of docs) {
    const srcPath = path.join(IMPORTS_DIR, `${doc.id}.html`)
    const destDir = path.join(TECHINSIGHT_DIR, doc.category)
    const destPath = path.join(destDir, doc.fileName)

    if (!fs.existsSync(srcPath)) {
      console.log(`  SKIP (not found): ${doc.id}.html`)
      continue
    }
    if (fs.existsSync(destPath)) {
      console.log(`  SKIP (target exists): ${doc.fileName}`)
      // Still remove source to clean up
      fs.unlinkSync(srcPath)
      continue
    }

    fs.mkdirSync(destDir, { recursive: true })
    fs.renameSync(srcPath, destPath)
    console.log(`  ✓ ${doc.fileName} → TechInsight/${doc.category}/`)
  }

  // ── Step 2: Migrate JSON data ──────────────────────────────────────────────

  // 2a: annotations
  {
    const filePath = path.join(BASE_DIR, '.insighthub-annotations.json')
    if (fs.existsSync(filePath)) {
      console.log('\n=== Step 2a: Migrate annotations ===')
      const data = readJson(filePath) as Array<{ documentId: string }>
      let count = 0
      for (const ann of data) {
        const newId = replaceId(ann.documentId)
        if (newId !== ann.documentId) {
          ann.documentId = newId
          count++
        }
      }
      writeJson(filePath, data)
      console.log(`  ✓ Updated ${count} annotations`)
    }
  }

  // 2b: read-meta
  {
    const filePath = path.join(BASE_DIR, '.insighthub-read-meta.json')
    if (fs.existsSync(filePath)) {
      console.log('\n=== Step 2b: Migrate read-meta ===')
      const data = readJson(filePath) as Record<string, { id: string }>
      let count = 0
      for (const [oldKey, value] of Object.entries(data)) {
        const newKey = replaceId(oldKey)
        if (newKey !== oldKey) {
          delete data[oldKey]
          value.id = newKey
          data[newKey] = value
          count++
        }
      }
      writeJson(filePath, data)
      console.log(`  ✓ Updated ${count} entries`)
    }
  }

  // 2c: read-history
  {
    const filePath = path.join(BASE_DIR, '.insighthub-read-history.json')
    if (fs.existsSync(filePath)) {
      console.log('\n=== Step 2c: Migrate read-history ===')
      const data = readJson(filePath) as Array<{ documentId: string }>
      let count = 0
      for (const entry of data) {
        const newId = replaceId(entry.documentId)
        if (newId !== entry.documentId) {
          entry.documentId = newId
          count++
        }
      }
      writeJson(filePath, data)
      console.log(`  ✓ Updated ${count} entries`)
    }
  }

  // 2d: quizzes
  {
    const filePath = path.join(BASE_DIR, '.insighthub-quizzes.json')
    if (fs.existsSync(filePath)) {
      console.log('\n=== Step 2d: Migrate quizzes ===')
      const data = readJson(filePath) as Record<string, { id: string; documentId: string }>
      let count = 0
      const newData: typeof data = {}
      for (const [oldKey, value] of Object.entries(data)) {
        const newKey = replaceId(oldKey)
        if (newKey !== oldKey) {
          value.id = `quiz-${newKey}`
          value.documentId = newKey
          newData[newKey] = value
          count++
        } else {
          newData[oldKey] = value
        }
      }
      writeJson(filePath, newData)
      console.log(`  ✓ Updated ${count} quizzes`)
    }
  }

  // 2e: quiz-history
  {
    const filePath = path.join(BASE_DIR, '.insighthub-quiz-history.json')
    if (fs.existsSync(filePath)) {
      console.log('\n=== Step 2e: Migrate quiz-history ===')
      const data = readJson(filePath) as Array<{ quizId: string; documentId: string }>
      let count = 0
      for (const entry of data) {
        const newDocId = replaceId(entry.documentId)
        if (newDocId !== entry.documentId) {
          entry.documentId = newDocId
          entry.quizId = `quiz-${newDocId}`
          count++
        }
      }
      writeJson(filePath, data)
      console.log(`  ✓ Updated ${count} attempts`)
    }
  }

  // 2f: tags
  {
    const filePath = path.join(BASE_DIR, '.insighthub-tags.json')
    if (fs.existsSync(filePath)) {
      console.log('\n=== Step 2f: Migrate tags ===')
      const data = readJson(filePath) as Array<{ documentIds: string[] }>
      let count = 0
      for (const tag of data) {
        tag.documentIds = tag.documentIds.map(id => {
          const newId = replaceId(id)
          if (newId !== id) count++
          return newId
        })
      }
      writeJson(filePath, data)
      console.log(`  ✓ Updated ${count} tag associations`)
    }
  }

  // ── Step 3: Cleanup ────────────────────────────────────────────────────────

  console.log('\n=== Step 3: Cleanup imported-docs metadata ===')
  writeJson(IMPORTED_DOCS_JSON, [])
  console.log('  ✓ Cleared .insighthub-imported-docs.json')

  // Remove imports dir if empty
  if (fs.existsSync(IMPORTS_DIR)) {
    const remaining = fs.readdirSync(IMPORTS_DIR)
    if (remaining.length === 0) {
      fs.rmdirSync(IMPORTS_DIR)
      console.log('  ✓ Removed empty .insighthub-imports/ directory')
    } else {
      console.log(`  ⚠ .insighthub-imports/ still has ${remaining.length} files`)
    }
  }

  console.log('\n✅ Migration complete!')
}

main()

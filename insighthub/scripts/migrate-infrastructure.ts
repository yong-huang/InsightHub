/**
 * One-time migration script: split TechInsight/infrastructure/ subdirectories
 * into top-level categories, move files, and update all .insighthub-*.json
 * data files to remap document IDs.
 *
 * Usage: npx tsx scripts/migrate-infrastructure.ts
 */
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const TECHINSIGHT_DIR = path.resolve(__dirname, '../../../TechInsight')
const DATA_DIR = path.resolve(__dirname, '..') // insighthub/

// Directory moves: [source under infrastructure/, target under TechInsight/]
const DIR_MOVES: Array<{ src: string; dest: string }> = [
  { src: 'kubernetes', dest: 'kubernetes' },
  { src: 'storage', dest: 'storage' },
  { src: 'storage-vendors', dest: 'storage/vendors' },
  { src: 'networking', dest: 'networking' },
  { src: 'architecture', dest: 'architecture' },
  { src: 'hci', dest: 'architecture/hci' },
  { src: 'devops', dest: 'devops' },
  { src: 'linux', dest: 'devops/linux' },
  { src: 'ci-cd', dest: 'devops/ci-cd' },
  { src: 'messaging', dest: 'devops/messaging' },
  { src: 'monitoring', dest: 'devops/monitoring' },
]

// ID prefix mapping (longer prefixes first to avoid partial matches)
const PREFIX_MAP: Array<{ old: string; new: string }> = [
  { old: 'ti-infrastructure-storage-vendors-', new: 'ti-storage-vendors-' },
  { old: 'ti-infrastructure-kubernetes-', new: 'ti-kubernetes-' },
  { old: 'ti-infrastructure-networking-', new: 'ti-networking-' },
  { old: 'ti-infrastructure-architecture-', new: 'ti-architecture-' },
  { old: 'ti-infrastructure-monitoring-', new: 'ti-devops-monitoring-' },
  { old: 'ti-infrastructure-messaging-', new: 'ti-devops-messaging-' },
  { old: 'ti-infrastructure-devops-', new: 'ti-devops-' },
  { old: 'ti-infrastructure-storage-', new: 'ti-storage-' },
  { old: 'ti-infrastructure-linux-', new: 'ti-devops-linux-' },
  { old: 'ti-infrastructure-ci-cd-', new: 'ti-devops-ci-cd-' },
  { old: 'ti-infrastructure-hci-', new: 'ti-architecture-hci-' },
]

/** Apply prefix replacement to a single ID string */
function migrateId(id: string): string {
  for (const { old: prefix, new: newPrefix } of PREFIX_MAP) {
    if (id.startsWith(prefix)) {
      return newPrefix + id.slice(prefix.length)
    }
  }
  return id
}

/** Recursively replace all old IDs in a JSON-compatible data structure */
function replaceIds(obj: any): any {
  if (typeof obj === 'string') {
    return migrateId(obj)
  }
  if (Array.isArray(obj)) {
    return obj.map(item => replaceIds(item))
  }
  if (obj && typeof obj === 'object') {
    const result: Record<string, any> = {}
    for (const [key, value] of Object.entries(obj)) {
      const newKey = migrateId(key)
      result[newKey] = replaceIds(value)
    }
    return result
  }
  return obj
}

function main() {
  console.log('=== Infrastructure Category Split Migration ===\n')

  const infraDir = path.join(TECHINSIGHT_DIR, 'infrastructure')
  if (!fs.existsSync(infraDir)) {
    console.log('infrastructure/ directory not found — nothing to migrate.')
    return
  }

  // Step 1: Move directories
  console.log('Step 1: Moving directories...\n')
  let filesMoved = 0

  for (const { src, dest } of DIR_MOVES) {
    const srcPath = path.join(infraDir, src)
    const destPath = path.join(TECHINSIGHT_DIR, dest)

    if (!fs.existsSync(srcPath)) {
      console.log(`  SKIP: ${src}/ not found`)
      continue
    }

    // Count files being moved
    const countFiles = (dir: string): number => {
      let count = 0
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.html')) count++
        else if (entry.isDirectory()) count += countFiles(path.join(dir, entry.name))
      }
      return count
    }

    const count = countFiles(srcPath)

    // Create parent directories for destination
    fs.mkdirSync(path.dirname(destPath), { recursive: true })

    if (fs.existsSync(destPath)) {
      // Merge: move individual files from src into existing dest
      console.log(`  MERGE: ${src}/ (${count} files) → ${dest}/ (exists)`)
      moveDirContents(srcPath, destPath)
    } else {
      // Direct rename
      fs.renameSync(srcPath, destPath)
      console.log(`  MOVE:  ${src}/ (${count} files) → ${dest}/`)
    }
    filesMoved += count
  }
  console.log(`\n  Total: ${filesMoved} files moved`)

  // Remove empty infrastructure directory
  tryRemoveEmptyDir(infraDir)

  // Step 2: Build ID map from before/after and update data files
  console.log('\nStep 2: Migrating data files...\n')

  const dataFiles = [
    '.insighthub-read-meta.json',
    '.insighthub-read-history.json',
    '.insighthub-annotations.json',
    '.insighthub-quizzes.json',
    '.insighthub-quiz-history.json',
    '.insighthub-tags.json',
    '.insighthub-concept-cards.json',
  ]

  let totalIdsReplaced = 0

  for (const dataFile of dataFiles) {
    const filePath = path.join(DATA_DIR, dataFile)
    if (!fs.existsSync(filePath)) {
      console.log(`  SKIP: ${dataFile} (not found)`)
      continue
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const original = raw
      const data = JSON.parse(raw)
      const migrated = replaceIds(data)
      const migratedJson = JSON.stringify(migrated, null, 2)

      if (migratedJson !== JSON.stringify(JSON.parse(original), null, 2)) {
        fs.writeFileSync(filePath, migratedJson, 'utf-8')
        // Count changes by comparing
        const oldIds = original.match(/ti-infrastructure-[a-z0-9-]+/g) || []
        const uniqueOldIds = new Set(oldIds)
        totalIdsReplaced += uniqueOldIds.size
        console.log(`  OK:   ${dataFile} (${uniqueOldIds.size} IDs updated)`)
      } else {
        console.log(`  OK:   ${dataFile} (no changes needed)`)
      }
    } catch (e) {
      console.error(`  ERROR: ${dataFile}:`, e)
    }
  }

  console.log(`\n  Total: ${totalIdsReplaced} unique IDs replaced in data files`)

  // Step 3: Verify
  console.log('\nStep 3: Verification...\n')

  const newDirs = ['kubernetes', 'storage', 'networking', 'architecture', 'devops']
  for (const dir of newDirs) {
    const fullPath = path.join(TECHINSIGHT_DIR, dir)
    if (fs.existsSync(fullPath)) {
      const count = countHtmlFiles(fullPath)
      console.log(`  TechInsight/${dir}/: ${count} HTML files`)
    }
  }

  if (fs.existsSync(infraDir)) {
    const remaining = countHtmlFiles(infraDir)
    console.log(`  TechInsight/infrastructure/: ${remaining} HTML files remaining`)
  } else {
    console.log('  TechInsight/infrastructure/: removed')
  }

  console.log('\n=== Migration complete! ===')
  console.log('Please restart the dev server and refresh the browser.')
}

/** Move all contents of srcDir into destDir recursively */
function moveDirContents(srcDir: string, destDir: string) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name)
    const destPath = path.join(destDir, entry.name)

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true })
      moveDirContents(srcPath, destPath)
    } else {
      if (fs.existsSync(destPath)) {
        console.log(`    SKIP (exists): ${entry.name}`)
      } else {
        fs.renameSync(srcPath, destPath)
      }
    }
  }
}

/** Recursively remove a directory only if it's empty */
function tryRemoveEmptyDir(dir: string) {
  if (!fs.existsSync(dir)) return
  const entries = fs.readdirSync(dir)
  if (entries.length === 0) {
    fs.rmdirSync(dir)
  } else {
    // Check if only empty subdirs remain
    let allEmpty = true
    for (const entry of entries) {
      const sub = path.join(dir, entry)
      if (fs.statSync(sub).isFile()) { allEmpty = false; break }
      try { tryRemoveEmptyDir(sub) } catch { allEmpty = false; break }
    }
    if (allEmpty) tryRemoveEmptyDir(dir)
  }
}

/** Count all .html files recursively */
function countHtmlFiles(dir: string): number {
  let count = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.html')) count++
    else if (entry.isDirectory()) count += countHtmlFiles(path.join(dir, entry.name))
  }
  return count
}

main()

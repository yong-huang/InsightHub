/**
 * One-time migration script: move 42 LeetCode files from TechInsight/algorithms/
 * to LeetcodeInsight/ organized by algorithm type, and update all .insighthub-*.json
 * data files to remap document IDs from ti-algorithms- to li-<category>-.
 *
 * Usage: npx tsx scripts/migrate-leetcode.ts
 */
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const TECHINSIGHT_DIR = path.resolve(__dirname, '../../../TechInsight')
const LEETCODEINSIGHT_DIR = path.resolve(__dirname, '../../../LeetCodeInsight')
const DATA_DIR = path.resolve(__dirname, '..') // insighthub/

// File classification
const FILE_MAP: Record<string, string[]> = {
  'arrays': [
    'leetcode-1-two-sum.html',
    'leetcode-11-container-with-most-water.html',
    'leetcode-15-3sum.html',
    'leetcode-16-three-sum-closest.html',
    'leetcode-18-4sum.html',
    'leetcode-66-plus-one.html',
    'leetcode-167-two-sum-ii.html',
    'leetcode-170-two-sum-iii.html',
    'leetcode-209-minimum-size-subarray-sum.html',
    'leetcode-560-subarray-sum-equals-k.html',
  ],
  'strings': [
    'leetcode-3-longest-substring.html',
    'leetcode-5-longest-palindromic-substring.html',
    'leetcode-6-zigzag-conversion.html',
    'leetcode-8-string-to-integer-atoi.html',
    'leetcode-12-integer-to-roman.html',
    'leetcode-13-roman-to-integer.html',
    'leetcode-14-longest-common-prefix.html',
    'leetcode-43-multiply-strings.html',
    'leetcode-67-add-binary.html',
    'leetcode-76-minimum-window-substring.html',
    'leetcode-340-longest-substring-with-at-most-k-distinct-characters.html',
    'leetcode-424-longest-repeating-character-replacement.html',
  ],
  'linked-list': [
    'leetcode-2-add-two-numbers.html',
    'leetcode-19-remove-nth-node.html',
    'leetcode-21-merge-two-sorted-lists.html',
    'leetcode-23-merge-k-sorted-lists.html',
    'leetcode-24-swap-nodes-in-pairs.html',
    'leetcode-25-reverse-nodes-in-k-group.html',
    'leetcode-445-add-two-numbers-ii.html',
  ],
  'stack': [
    'leetcode-20-valid-parentheses.html',
    'leetcode-22-generate-parentheses.html',
  ],
  'math': [
    'leetcode-7-reverse-integer.html',
    'leetcode-9-palindrome-number.html',
  ],
  'dynamic-programming': [
    'leetcode-4-median-two-sorted-arrays.html',
    'leetcode-10-regular-expression-matching.html',
  ],
  'binary-search': [
    'leetcode-33-search-in-rotated-sorted-array.html',
  ],
  'summary': [
    'leetcode-1-100-summary.html',
    'leetcode-1-20-interview-preparation.html',
    'leetcode-21-40-interview-preparation.html',
    'leetcode-41-60-interview-preparation.html',
    'leetcode-61-80-interview-preparation.html',
    'leetcode-81-100-interview-preparation.html',
  ],
}

// Build ID mapping: old ID → new ID
function buildIdMap(): Map<string, string> {
  const idMap = new Map<string, string>()
  for (const [category, files] of Object.entries(FILE_MAP)) {
    for (const file of files) {
      const nameWithoutExt = file.replace(/\.html$/, '')
      const oldId = `ti-algorithms-${nameWithoutExt}`
      const newId = `li-${category}-${nameWithoutExt}`
      idMap.set(oldId, newId)
    }
  }
  return idMap
}

// Replace all occurrences of old IDs in a JSON-compatible data structure
function replaceIds(obj: any, idMap: Map<string, string>): any {
  if (typeof obj === 'string') {
    return idMap.get(obj) ?? obj
  }
  if (Array.isArray(obj)) {
    return obj.map(item => replaceIds(item, idMap))
  }
  if (obj && typeof obj === 'object') {
    const result: Record<string, any> = {}
    for (const [key, value] of Object.entries(obj)) {
      const newKey = idMap.get(key) ?? key
      result[newKey] = replaceIds(value, idMap)
    }
    return result
  }
  return obj
}

function main() {
  const idMap = buildIdMap()
  console.log(`Built ${idMap.size} ID mappings`)

  let filesMoved = 0

  // Step 1: Move files
  for (const [category, files] of Object.entries(FILE_MAP)) {
    const targetDir = path.join(LEETCODEINSIGHT_DIR, category)
    fs.mkdirSync(targetDir, { recursive: true })

    for (const file of files) {
      const srcPath = path.join(TECHINSIGHT_DIR, 'algorithms', file)
      const destPath = path.join(targetDir, file)

      if (!fs.existsSync(srcPath)) {
        console.warn(`  Warning: source not found, skipping: ${srcPath}`)
        continue
      }

      if (fs.existsSync(destPath)) {
        console.log(`  Already exists, skipping: ${destPath}`)
        continue
      }

      fs.copyFileSync(srcPath, destPath)
      fs.unlinkSync(srcPath)
      filesMoved++
    }
  }
  console.log(`Moved ${filesMoved} files to LeetcodeInsight/`)

  // Step 2: Migrate data files
  const dataFiles = [
    '.insighthub-read-meta.json',
    '.insighthub-read-history.json',
    '.insighthub-annotations.json',
    '.insighthub-quizzes.json',
    '.insighthub-quiz-history.json',
    '.insighthub-tags.json',
    '.insighthub-concept-cards.json',
  ]

  for (const dataFile of dataFiles) {
    const filePath = path.join(DATA_DIR, dataFile)
    if (!fs.existsSync(filePath)) {
      console.log(`  Skipping ${dataFile} (not found)`)
      continue
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const data = JSON.parse(raw)
      const migrated = replaceIds(data, idMap)
      fs.writeFileSync(filePath, JSON.stringify(migrated, null, 2), 'utf-8')
      console.log(`  Migrated ${dataFile}`)
    } catch (e) {
      console.error(`  Error migrating ${dataFile}:`, e)
    }
  }

  // Step 3: Verify
  let totalInLeetcode = 0
  for (const category of Object.keys(FILE_MAP)) {
    const dir = path.join(LEETCODEINSIGHT_DIR, category)
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'))
      totalInLeetcode += files.length
    }
  }
  console.log(`\nVerification: ${totalInLeetcode} files in LeetcodeInsight/`)

  // Check remaining files in TechInsight/algorithms/
  const remainingDir = path.join(TECHINSIGHT_DIR, 'algorithms')
  if (fs.existsSync(remainingDir)) {
    const remaining = fs.readdirSync(remainingDir).filter(f => f.endsWith('.html'))
    console.log(`Remaining in TechInsight/algorithms/: ${remaining.length} files: ${remaining.join(', ')}`)
  }

  console.log('\nMigration complete!')
}

main()

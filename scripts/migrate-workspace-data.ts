/**
 * One-time migration script: TechInsight → AIInsight
 *
 * Migrates document references for categories that moved from
 * TechInsight (ti-) prefix to AIInsight (ai-) prefix.
 *
 * Categories moved: ai-frameworks, dl-fundamentals, llm-comparisons,
 *                   llm-fundamentals, rag-comparisons, mlops
 *
 * Usage:
 *   npx tsx scripts/migrate-workspace-data.ts [--dry-run]
 */

import * as fs from 'fs'
import * as path from 'path'

const DATA_DIR = path.resolve(__dirname, '..', 'insighthub', 'data')

// Only migrate IDs matching these category patterns
const MIGRATE_PATTERN = /^ti-(ai-frameworks|dl-fundamentals|llm-comparisons|llm-fundamentals|rag-comparisons|mlops)-/

function migrateId(id: string): string | null {
  if (!MIGRATE_PATTERN.test(id)) return null
  return id.replace(/^ti-/, 'ai-')
}

function readJson<T>(filename: string): T | null {
  const fp = path.join(DATA_DIR, filename)
  if (!fs.existsSync(fp)) return null
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf-8')) as T
  } catch {
    console.error(`  ⚠ Failed to parse ${filename}`)
    return null
  }
}

function writeJson(filename: string, data: unknown): void {
  const fp = path.join(DATA_DIR, filename)
  fs.writeFileSync(fp, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

const dryRun = process.argv.includes('--dry-run')
if (dryRun) console.log('=== DRY RUN — no files will be modified ===\n')

let totalChanges = 0

function report(file: string, count: number) {
  totalChanges += count
  console.log(`  ${file}: ${count} entries migrated`)
}

// --- Migrate annotations (array with documentId field) ---
{
  const data = readJson<any[]>('.insighthub-annotations.json')
  if (data) {
    let count = 0
    for (const ann of data) {
      const newId = migrateId(ann.documentId)
      if (newId) { ann.documentId = newId; count++ }
    }
    report('annotations', count)
    if (count > 0 && !dryRun) writeJson('.insighthub-annotations.json', data)
  }
}

// --- Migrate quiz-history (array with documentId field) ---
{
  const data = readJson<any[]>('.insighthub-quiz-history.json')
  if (data) {
    let count = 0
    for (const entry of data) {
      const newDocId = migrateId(entry.documentId)
      if (newDocId) { entry.documentId = newDocId; count++ }
      // quizId may also contain the old prefix (format: quiz-{docId})
      const newQuizId = migrateId(entry.quizId?.replace(/^quiz-/, ''))
      if (newQuizId) { entry.quizId = `quiz-${newQuizId}`; count++ }
    }
    report('quiz-history', count)
    if (count > 0 && !dryRun) writeJson('.insighthub-quiz-history.json', data)
  }
}

// --- Migrate quizzes (object keyed by docId, entries have documentId) ---
{
  const data = readJson<Record<string, any>>('.insighthub-quizzes.json')
  if (data) {
    let count = 0
    const newData: Record<string, any> = {}
    for (const [key, quiz] of Object.entries(data)) {
      const newKey = migrateId(key)
      if (newKey) {
        newData[newKey] = quiz
        quiz.documentId = newKey
        if (quiz.id) quiz.id = `quiz-${newKey}`
        count++
      } else {
        newData[key] = quiz
      }
    }
    report('quizzes', count)
    if (count > 0 && !dryRun) writeJson('.insighthub-quizzes.json', newData)
  }
}

// --- Migrate concept-cards (array with sourceDocId field) ---
{
  const data = readJson<any[]>('.insighthub-concept-cards.json')
  if (data) {
    let count = 0
    for (const card of data) {
      const newId = migrateId(card.sourceDocId)
      if (newId) { card.sourceDocId = newId; count++ }
    }
    report('concept-cards', count)
    if (count > 0 && !dryRun) writeJson('.insighthub-concept-cards.json', data)
  }
}

// --- Migrate read-meta (object keyed by docId, entries have id) ---
{
  const data = readJson<Record<string, any>>('.insighthub-read-meta.json')
  if (data) {
    let count = 0
    const newData: Record<string, any> = {}
    for (const [key, meta] of Object.entries(data)) {
      const newKey = migrateId(key)
      if (newKey) {
        newData[newKey] = meta
        meta.id = newKey
        count++
      } else {
        newData[key] = meta
      }
    }
    report('read-meta', count)
    if (count > 0 && !dryRun) writeJson('.insighthub-read-meta.json', newData)
  }
}

// --- Migrate read-history (array with documentId field) ---
{
  const data = readJson<any[]>('.insighthub-read-history.json')
  if (data) {
    let count = 0
    for (const entry of data) {
      const newId = migrateId(entry.documentId)
      if (newId) { entry.documentId = newId; count++ }
    }
    report('read-history', count)
    if (count > 0 && !dryRun) writeJson('.insighthub-read-history.json', data)
  }
}

// --- Migrate tags (array, each tag has documentIds array) ---
{
  const data = readJson<any[]>('.insighthub-tags.json')
  if (data) {
    let count = 0
    for (const tag of data) {
      if (Array.isArray(tag.documentIds)) {
        const newIds = tag.documentIds.map((id: string) => {
          const newId = migrateId(id)
          if (newId) { count++; return newId }
          return id
        })
        tag.documentIds = newIds
      }
    }
    report('tags', count)
    if (count > 0 && !dryRun) writeJson('.insighthub-tags.json', data)
  }
}

// --- Migrate client-storage (catch-all for localStorage-backed data) ---
{
  const data = readJson<Record<string, any>>('.insighthub-client-storage.json')
  if (data) {
    let count = 0
    // Key: insighthub:document-meta — object keyed by docId
    const docMetaKey = 'insighthub:document-meta'
    if (data[docMetaKey]) {
      const meta = data[docMetaKey]
      const newMeta: Record<string, any> = {}
      for (const [key, val] of Object.entries(meta as Record<string, any>)) {
        const newKey = migrateId(key)
        if (newKey) { newMeta[newKey] = { ...(val as any), id: newKey }; count++ }
        else newMeta[key] = val
      }
      data[docMetaKey] = newMeta
    }

    // Key: insighthub:annotations — array with documentId
    const annKey = 'insighthub:annotations'
    if (Array.isArray(data[annKey])) {
      for (const ann of data[annKey]) {
        const newId = migrateId(ann.documentId)
        if (newId) { ann.documentId = newId; count++ }
      }
    }

    // Key: insighthub:concept-cards — array with sourceDocId
    const ccKey = 'insighthub:concept-cards'
    if (Array.isArray(data[ccKey])) {
      for (const card of data[ccKey]) {
        const newId = migrateId(card.sourceDocId)
        if (newId) { card.sourceDocId = newId; count++ }
      }
    }

    // Key: insighthub:quiz-history — array with documentId
    const qhKey = 'insighthub:quiz-history'
    if (Array.isArray(data[qhKey])) {
      for (const entry of data[qhKey]) {
        const newId = migrateId(entry.documentId)
        if (newId) { entry.documentId = newId; count++ }
        const newQuizId = migrateId(entry.quizId?.replace(/^quiz-/, ''))
        if (newQuizId) { entry.quizId = `quiz-${newQuizId}`; count++ }
      }
    }

    // Key: insighthub:read-later — array with documentId
    const rlKey = 'insighthub:read-later'
    if (Array.isArray(data[rlKey])) {
      for (const entry of data[rlKey]) {
        const newId = migrateId(entry.documentId)
        if (newId) { entry.documentId = newId; count++ }
      }
    }

    // Key: insighthub:read-history — array with documentId
    const rhKey = 'insighthub:read-history'
    if (Array.isArray(data[rhKey])) {
      for (const entry of data[rhKey]) {
        const newId = migrateId(entry.documentId)
        if (newId) { entry.documentId = newId; count++ }
      }
    }

    // Key: insighthub:tags — array with documentIds
    const tagKey = 'insighthub:tags'
    if (Array.isArray(data[tagKey])) {
      for (const tag of data[tagKey]) {
        if (Array.isArray(tag.documentIds)) {
          tag.documentIds = tag.documentIds.map((id: string) => migrateId(id) || id)
        }
      }
    }

    // Key: insighthub:quizzes — object keyed by docId
    const quizKey = 'insighthub:quizzes'
    if (data[quizKey] && typeof data[quizKey] === 'object') {
      const quizzes = data[quizKey] as Record<string, any>
      const newQuizzes: Record<string, any> = {}
      for (const [key, quiz] of Object.entries(quizzes)) {
        const newKey = migrateId(key)
        if (newKey) { newQuizzes[newKey] = quiz; quiz.documentId = newKey; count++ }
        else newQuizzes[key] = quiz
      }
      data[quizKey] = newQuizzes
    }

    // Key: insighthub:summaries — object keyed by docId
    const sumKey = 'insighthub:summaries'
    if (data[sumKey] && typeof data[sumKey] === 'object') {
      const sums = data[sumKey] as Record<string, any>
      const newSums: Record<string, any> = {}
      for (const [key, val] of Object.entries(sums)) {
        const newKey = migrateId(key)
        if (newKey) { newSums[newKey] = val; count++ }
        else newSums[key] = val
      }
      data[sumKey] = newSums
    }

    // Key: insighthub:reading-positions — object keyed by docId
    const rpKey = 'insighthub:reading-positions'
    if (data[rpKey] && typeof data[rpKey] === 'object') {
      const positions = data[rpKey] as Record<string, any>
      const newPositions: Record<string, any> = {}
      for (const [key, val] of Object.entries(positions)) {
        const newKey = migrateId(key)
        if (newKey) { newPositions[newKey] = val; count++ }
        else newPositions[key] = val
      }
      data[rpKey] = newPositions
    }

    // Key: insighthub:chat-history — nested object: { docId: messages[] }
    const chKey = 'insighthub:chat-history'
    if (data[chKey] && typeof data[chKey] === 'object') {
      const chats = data[chKey] as Record<string, any>
      const newChats: Record<string, any> = {}
      for (const [key, val] of Object.entries(chats)) {
        const newKey = migrateId(key)
        if (newKey) { newChats[newKey] = val; count++ }
        else newChats[key] = val
      }
      data[chKey] = newChats
    }

    report('client-storage', count)
    if (count > 0 && !dryRun) writeJson('.insighthub-client-storage.json', data)
  }
}

console.log(`\nTotal: ${totalChanges} entries migrated`)
if (dryRun) console.log('(dry run — run without --dry-run to apply)')
else console.log('Done!')

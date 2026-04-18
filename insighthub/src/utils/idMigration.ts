/**
 * Idempotent client-side migration: replace old ti-infrastructure-* document IDs
 * in localStorage with new top-level category IDs.
 *
 * Called once from useInitializeApp before store initialization.
 * Guarded by insighthub:db-version — skips if already at version 2+.
 */

const DB_VERSION_KEY = 'insighthub:db-version'
const TARGET_VERSION = 2
const PREFIX = 'insighthub:'

// Sorted longest-first to avoid partial prefix matches
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

function migrateId(id: string): string {
  for (const { old: prefix, new: newPrefix } of PREFIX_MAP) {
    if (id.startsWith(prefix)) {
      return newPrefix + id.slice(prefix.length)
    }
  }
  return id
}

function replaceIds(obj: any): any {
  if (typeof obj === 'string') {
    return migrateId(obj)
  }
  if (Array.isArray(obj)) {
    return obj.map((item: any) => replaceIds(item))
  }
  if (obj && typeof obj === 'object') {
    const result: Record<string, any> = {}
    for (const [key, value] of Object.entries(obj)) {
      result[migrateId(key)] = replaceIds(value)
    }
    return result
  }
  return obj
}

export function runIdMigration() {
  const currentVersion = parseInt(localStorage.getItem(DB_VERSION_KEY) || '0', 10)
  if (currentVersion >= TARGET_VERSION) return

  const keys = [
    'document-meta',
    'read-history',
    'tags',
    'quiz-history',
    'quizzes',
    'annotations',
    'summaries',
    'reading-positions',
    'read-later',
    'flashcards',
    'chat-history',
    'concept-cards',
  ]

  let migrated = 0

  for (const key of keys) {
    const fullKey = PREFIX + key
    const raw = localStorage.getItem(fullKey)
    if (!raw) continue

    try {
      const original = raw
      const data = JSON.parse(raw)
      const newData = replaceIds(data)
      const newJson = JSON.stringify(newData)
      if (newJson !== JSON.stringify(JSON.parse(original))) {
        localStorage.setItem(fullKey, newJson)
        migrated++
      }
    } catch {
      // Skip corrupted entries
    }
  }

  if (migrated > 0) {
    console.log(`[idMigration] Migrated ${migrated} localStorage keys`)
  }

  localStorage.setItem(DB_VERSION_KEY, String(TARGET_VERSION))
}

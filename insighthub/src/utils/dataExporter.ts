import { storageKeys } from '@/services/storageService'

export interface ExportData {
  version: 1
  exportedAt: number
  localStorage: Record<string, unknown>
  server: Record<string, unknown>
}

const SERVER_ENDPOINTS = [
  { key: 'readMeta', url: '/api/read-meta' },
  { key: 'readHistory', url: '/api/read-history' },
  { key: 'annotations', url: '/api/annotations' },
  { key: 'tags', url: '/api/tags' },
  { key: 'quizzes', url: '/api/quizzes' },
  { key: 'quizHistory', url: '/api/quiz-history' },
  { key: 'conceptCards', url: '/api/concept-cards' },
  { key: 'importedDocs', url: '/api/imported-documents' },
] as const

export async function exportAllData(): Promise<void> {
  // Collect localStorage data
  const localData: Record<string, unknown> = {}
  for (const key of Object.values(storageKeys)) {
    const raw = localStorage.getItem(key)
    if (raw !== null) {
      try {
        localData[key] = JSON.parse(raw)
      } catch {
        localData[key] = raw
      }
    }
  }

  // Collect server data in parallel
  const serverData: Record<string, unknown> = {}
  await Promise.all(
    SERVER_ENDPOINTS.map(async ({ key, url }) => {
      try {
        const res = await fetch(url)
        if (res.ok) {
          serverData[key] = await res.json()
        }
      } catch { /* endpoint unavailable — skip */ }
    }),
  )

  const data: ExportData = {
    version: 1,
    exportedAt: Date.now(),
    localStorage: localData,
    server: serverData,
  }

  // Download as JSON file
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const date = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `insighthub-backup-${date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importAllData(
  data: ExportData,
): Promise<{ ok: boolean; localKeys: number; serverEndpoints: number }> {
  if (!data || data.version !== 1) {
    throw new Error(`Unsupported backup version: ${data?.version ?? 'unknown'}`)
  }

  // Write localStorage
  let localKeys = 0
  for (const [key, value] of Object.entries(data.localStorage || {})) {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
    localKeys++
  }

  // Write server data
  let serverEndpoints = 0
  const s = data.server || {}

  // Array endpoints: full overwrite
  const arrayEndpoints: { data: unknown; url: string }[] = [
    { data: s.tags, url: '/api/tags' },
    { data: s.annotations, url: '/api/annotations' },
    { data: s.conceptCards, url: '/api/concept-cards' },
  ]

  for (const { data: arr, url } of arrayEndpoints) {
    if (Array.isArray(arr)) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(arr),
      })
      if (res.ok) serverEndpoints++
    }
  }

  // read-meta: object, POST each entry
  if (s.readMeta && typeof s.readMeta === 'object') {
    for (const entry of Object.values(s.readMeta) as Record<string, unknown>[]) {
      if (entry?.id) {
        await fetch('/api/read-meta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
        })
      }
    }
    serverEndpoints++
  }

  // quizzes: object keyed by documentId, POST each
  if (s.quizzes && typeof s.quizzes === 'object') {
    for (const quiz of Object.values(s.quizzes) as Record<string, unknown>[]) {
      if (quiz?.documentId) {
        await fetch('/api/quizzes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(quiz),
        })
      }
    }
    serverEndpoints++
  }

  // read-history: array, POST each (reverse so newest ends up first after prepends)
  if (Array.isArray(s.readHistory)) {
    const reversed = [...s.readHistory].reverse()
    for (const entry of reversed) {
      if (entry?.documentId) {
        await fetch('/api/read-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
        })
      }
    }
    serverEndpoints++
  }

  // quiz-history: array, POST each (reverse so newest ends up first)
  if (Array.isArray(s.quizHistory)) {
    const reversed = [...s.quizHistory].reverse()
    for (const entry of reversed) {
      await fetch('/api/quiz-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      })
    }
    serverEndpoints++
  }

  return { ok: true, localKeys, serverEndpoints }
}

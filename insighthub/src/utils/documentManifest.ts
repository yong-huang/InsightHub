import type { Source } from '@/types'

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

let manifestCache: Promise<DocumentManifestEntry[]> | null = null

export function fetchDocumentManifest(): Promise<DocumentManifestEntry[]> {
  if (!manifestCache) {
    manifestCache = fetch('/api/documents')
      .then(res => {
        if (!res.ok) throw new Error(`Failed to fetch document manifest: ${res.status}`)
        return res.json()
      })
      .catch(err => {
        manifestCache = null // Allow retry on failure
        throw err
      })
  }
  return manifestCache
}

export function clearManifestCache(): void {
  manifestCache = null
}

export interface DocumentManifestEntry {
  id: string
  filePath: string
  fileName: string
  source: 'mindinsight' | 'techinsight'
  category: string
  subcategory?: string
}

export async function fetchDocumentManifest(): Promise<DocumentManifestEntry[]> {
  const url = '/api/documents'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch document manifest: ${res.status}`)
  return res.json()
}

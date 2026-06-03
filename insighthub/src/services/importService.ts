import type { ImportedDocumentRecord, Document, Source } from '@/types'
import { parseHtmlDocument } from '@/utils/htmlParser'

export async function fetchImportedDocs(): Promise<ImportedDocumentRecord[]> {
  const res = await fetch('/api/imported-documents')
  if (!res.ok) throw new Error(`Failed to fetch imported documents: ${res.status}`)
  return res.json()
}

export async function importDocument(
  fileName: string,
  htmlContent: string,
  source: Source,
  category: string,
  parsedMeta?: { title?: string; wordCount?: number; language?: string },
): Promise<{ id: string }> {
  const res = await fetch('/api/imported-documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      htmlContent,
      fileName,
      source,
      category,
      ...parsedMeta,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Import failed' }))
    throw new Error(err.error || 'Import failed')
  }
  return res.json()
}

export async function deleteImportedDocument(docId: string): Promise<void> {
  const res = await fetch(`/api/imported-documents?id=${encodeURIComponent(docId)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to delete document: ${res.status}`)
}

export async function fetchImportedDocHtml(docId: string): Promise<string> {
  const res = await fetch(`/api/imported-doc/${encodeURIComponent(docId)}`)
  if (!res.ok) throw new Error(`Failed to fetch document HTML: ${res.status}`)
  return res.text()
}

export async function convertImportedToDocument(record: ImportedDocumentRecord): Promise<Document> {
  const htmlContent = await fetchImportedDocHtml(record.id)
  const parsed = parseHtmlDocument(htmlContent, {
    id: record.id,
    filePath: `imported://${record.fileName}`,
    fileName: record.fileName,
    source: record.source,
    category: record.category,
  })
  return {
    ...parsed,
    isRead: false,
    readCount: 0,
    tags: [],
    indexedAt: Date.now(),
  }
}

export async function deleteWorkspaceCategory(
  workspaceId: string,
  category: string,
): Promise<{ deletedIds: string[] }> {
  const res = await fetch(
    `/api/workspace-category?workspaceId=${encodeURIComponent(workspaceId)}&category=${encodeURIComponent(category)}`,
    { method: 'DELETE' },
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Delete failed' }))
    throw new Error(err.error || 'Delete failed')
  }
  return res.json()
}

export async function moveWorkspaceCategory(
  workspaceId: string,
  category: string,
  targetWorkspaceId: string,
  targetCategory: string,
): Promise<{ mappings: Record<string, string> }> {
  const res = await fetch('/api/move-workspace-category', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId, category, targetWorkspaceId, targetCategory }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Move failed' }))
    throw new Error(err.error || 'Move failed')
  }
  return res.json()
}

export async function moveDocumentToWorkspace(
  docId: string,
  targetWorkspaceId: string,
  targetCategory: string,
): Promise<{ newId: string }> {
  const res = await fetch('/api/move-workspace-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: docId, targetWorkspaceId, targetCategory }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Move failed' }))
    throw new Error(err.error || 'Move failed')
  }
  return res.json()
}

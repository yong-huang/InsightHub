import { useDocumentStore } from '@/stores/documentStore'

export function useDocumentUrl(docId: string): string {
  const doc = useDocumentStore(s => s.documents.get(docId))

  if (!doc) return ''

  const categoryPath = doc.subcategory
    ? `${doc.category}/${doc.subcategory}`
    : doc.category

  if (import.meta.env.DEV) {
    return `/dev-docs/${doc.source}/${categoryPath}/${doc.fileName}`
  }

  // Production: files copied to public/docs/
  return `/docs/${doc.source}/${categoryPath}/${doc.fileName}`
}

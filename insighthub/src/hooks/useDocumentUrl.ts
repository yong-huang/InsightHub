import { useDocumentStore } from '@/stores/documentStore'

export function useDocumentUrl(docId: string): string {
  const doc = useDocumentStore(s => s.documents.get(docId))

  if (!doc) return ''

  if (doc.id.startsWith('imported-')) {
    return `/api/imported-doc/${doc.id}`
  }

  const categoryPath = doc.subcategory
    ? `${doc.category}/${doc.subcategory}`
    : doc.category
  const middle = categoryPath ? `/${categoryPath}` : ''

  if (import.meta.env.DEV) {
    return `/dev-docs/${doc.source}${middle}/${doc.fileName}?_=${doc.indexedAt}`
  }

  // Production: files copied to public/docs/
  return `/docs/${doc.source}${middle}/${doc.fileName}`
}

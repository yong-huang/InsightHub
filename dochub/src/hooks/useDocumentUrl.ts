import { useDocumentStore } from '@/stores/documentStore'

const MINDINSIGHT_DIR = '/Users/hyhit/Desktop/workspace/projects/MindInsight'
const TECHINSIGHT_DIR = '/Users/hyhit/Desktop/workspace/projects/TechInsight'

export function useDocumentUrl(docId: string): string {
  const doc = useDocumentStore(s => s.documents.get(docId))

  if (!doc) return ''

  if (import.meta.env.DEV) {
    const baseDir = doc.source === 'mindinsight' ? MINDINSIGHT_DIR : TECHINSIGHT_DIR
    const categoryPath = doc.subcategory
      ? `${doc.category}/${doc.subcategory}`
      : doc.category
    return `/@fs${baseDir}/${categoryPath}/${doc.fileName}`
  }

  // Production: files copied to public/docs/
  const categoryPath = doc.subcategory
    ? `${doc.category}/${doc.subcategory}`
    : doc.category
  return `/docs/${doc.source}/${categoryPath}/${doc.fileName}`
}

import { useMemo } from 'react'
import { useDocumentStore } from '@/stores/documentStore'
import { getCategoryInfo } from '@/utils/categoryMap'
import type { Source } from '@/types'

export interface DynamicCategory {
  key: string
  label: string
  source: Source
  icon: string
  docCount: number
  readCount: number
}

export function useDynamicCategories(source?: string): DynamicCategory[] {
  const documents = useDocumentStore(s => s.documents)

  return useMemo(() => {
    const allDocs = source
      ? Array.from(documents.values()).filter(d => d.source === source)
      : Array.from(documents.values())

    // Group by category
    const catMap = new Map<string, { docs: typeof allDocs }>()
    for (const doc of allDocs) {
      if (!doc.category) continue
      const entry = catMap.get(doc.category)
      if (entry) {
        entry.docs.push(doc)
      } else {
        catMap.set(doc.category, { docs: [doc] })
      }
    }

    // Build dynamic categories — getCategoryInfo handles label/icon enrichment
    const result: DynamicCategory[] = []
    for (const [key, { docs }] of catMap) {
      const info = getCategoryInfo(key)
      result.push({
        key,
        label: info.label,
        source: info.source,
        icon: info.icon,
        docCount: docs.length,
        readCount: docs.filter(d => d.isRead).length,
      })
    }

    // Sort by docCount descending
    result.sort((a, b) => b.docCount - a.docCount)
    return result
  }, [documents, source])
}

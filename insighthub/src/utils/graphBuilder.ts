import type { Document, Tag, Annotation, Source, WorkspaceConfig } from '@/types'
import { getCategoryInfo } from '@/utils/categoryMap'
import { parseWikiLinks } from '@/utils/bidirectionalLinks'
import { getSourceColor, getWorkspaceConfig } from '@/utils/workspaceUtils'

/** Derive unique categories from documents */
function deriveCategories(docs: Document[]): { key: string; label: string; source: string }[] {
  const seen = new Set<string>()
  const result: { key: string; label: string; source: string }[] = []
  for (const doc of docs) {
    if (!doc.category || seen.has(doc.category)) continue
    seen.add(doc.category)
    const info = getCategoryInfo(doc.category)
    result.push({ key: doc.category, label: info.label, source: info.source })
  }
  return result
}

export interface GraphNode {
  id: string
  type: 'source' | 'category' | 'document' | 'tag'
  label: string
  color: string
  size: number
  data?: { docId?: string; categoryKey?: string; tagId?: string; categorySource?: string }
}

export interface GraphLink {
  source: string
  target: string
  type: string
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

export interface GraphOptions {
  maxDocNodes?: number
  minTagDocs?: number
  readDocsOnly?: boolean
  filterSource?: 'all' | Source
  showDocuments?: boolean
  annotations?: Annotation[]
  workspaces?: WorkspaceConfig[]
}

const CATEGORY_COLORS = [
  '#fbbf24', '#f97316', '#ef4444', '#a78bfa', '#ec4899',
  '#326ce5', '#4ecdc4', '#22d3ee', '#6366f1', '#818cf8',
  '#84cc16', '#14b8a6', '#fb923c', '#f472b6', '#facc15',
]

export function buildGraphData(
  documents: Map<string, Document>,
  tags: Tag[],
  options: GraphOptions = {},
): GraphData {
  const {
    maxDocNodes = 200,
    minTagDocs = 1,
    filterSource = 'all',
    showDocuments = true,
    readDocsOnly = false,
    annotations = [],
    workspaces = [],
  } = options

  const nodes: GraphNode[] = []
  const links: GraphLink[] = []
  const nodeIds = new Set<string>()

  const addNode = (node: GraphNode) => {
    if (!nodeIds.has(node.id)) {
      nodeIds.add(node.id)
      nodes.push(node)
    }
  }

  const addLink = (source: string, target: string, type: string) => {
    if (source !== target) {
      links.push({ source, target, type })
    }
  }

  const allDocs = Array.from(documents.values())
  const filteredDocs = filterSource === 'all'
    ? allDocs
    : allDocs.filter(d => d.source === filterSource)

  // Source nodes
  const sources = filterSource === 'all'
    ? workspaces.map(w => w.id)
    : [filterSource] as const

  for (const src of sources) {
    addNode({
      id: `source:${src}`,
      type: 'source',
      label: getWorkspaceConfig(src, workspaces)?.label || src,
      color: getSourceColor(src, workspaces),
      size: 30,
    })
  }

  // Category nodes — derive from documents instead of hardcoded CATEGORIES
  let catIndex = 0
  const derivedCategories = deriveCategories(filteredDocs)
  for (const cat of derivedCategories) {
    if (filterSource !== 'all' && cat.source !== filterSource) continue
    const catDocs = filteredDocs.filter(d => d.category === cat.key)
    if (catDocs.length === 0) continue

    addNode({
      id: `cat:${cat.key}`,
      type: 'category',
      label: cat.label,
      color: CATEGORY_COLORS[catIndex % CATEGORY_COLORS.length],
      size: Math.max(12, Math.min(28, 8 + catDocs.length * 2)),
      data: { categoryKey: cat.key, categorySource: cat.source },
    })
    addLink(`source:${cat.source}`, `cat:${cat.key}`, 'contains')
    catIndex++
  }

  // Document nodes
  if (showDocuments) {
    const graphDocs = readDocsOnly
      ? filteredDocs.filter(d => d.isRead)
      : filteredDocs
    const docSlice = graphDocs.sort((a, b) => b.wordCount - a.wordCount).slice(0, maxDocNodes)

    for (const doc of docSlice) {
      if (!doc.category) continue
      const size = Math.max(4, Math.min(14, 4 + Math.log2(doc.wordCount + 1)))
      const opacity = doc.isRead ? 'cc' : '55'
      addNode({
        id: `doc:${doc.id}`,
        type: 'document',
        label: doc.title.length > 20 ? doc.title.slice(0, 20) + '...' : doc.title,
        color: getSourceColor(doc.source, workspaces) + opacity,
        size,
        data: { docId: doc.id },
      })
      addLink(`cat:${doc.category}`, `doc:${doc.id}`, 'belongs')
    }
  }

  // Tag nodes
  const relevantTags = tags.filter(t => {
    const relevantDocIds = t.documentIds.filter(id => {
      const doc = documents.get(id)
      return doc && (filterSource === 'all' || doc.source === filterSource)
    })
    return relevantDocIds.length >= minTagDocs
  })

  for (const tag of relevantTags) {
    const relevantDocIds = tag.documentIds.filter(id => {
      const doc = documents.get(id)
      return doc && (filterSource === 'all' || doc.source === filterSource)
    })

    addNode({
      id: `tag:${tag.id}`,
      type: 'tag',
      label: tag.name,
      color: tag.color,
      size: Math.max(6, Math.min(18, 6 + relevantDocIds.length * 2)),
      data: { tagId: tag.id },
    })

    // Connect tag to its documents (only if they are in the graph)
    for (const docId of relevantDocIds) {
      if (nodeIds.has(`doc:${docId}`)) {
        addLink(`tag:${tag.id}`, `doc:${docId}`, 'tagged')
      }
    }
  }

  // Tag co-occurrence edges
  const tagDocMap = new Map<string, Set<string>>()
  for (const tag of relevantTags) {
    const docIds = new Set(tag.documentIds.filter(id => {
      const doc = documents.get(id)
      return doc && (filterSource === 'all' || doc.source === filterSource)
    }))
    tagDocMap.set(tag.id, docIds)
  }

  const tagIds = relevantTags.map(t => t.id)
  for (let i = 0; i < tagIds.length; i++) {
    for (let j = i + 1; j < tagIds.length; j++) {
      const setA = tagDocMap.get(tagIds[i])!
      const setB = tagDocMap.get(tagIds[j])!
      let overlap = 0
      for (const id of setA) {
        if (setB.has(id)) overlap++
      }
      if (overlap >= 2) {
        addLink(`tag:${tagIds[i]}`, `tag:${tagIds[j]}`, 'co-occurrence')
      }
    }
  }

  // Reference edges from wiki links in annotations
  if (showDocuments && annotations.length > 0) {
    const titleToDocId = new Map<string, string>()
    for (const doc of filteredDocs) {
      titleToDocId.set(doc.title, doc.id)
    }
    for (const ann of annotations) {
      if (!ann.comment) continue
      const titles = parseWikiLinks(ann.comment)
      const srcDocId = ann.documentId
      if (!nodeIds.has(`doc:${srcDocId}`)) continue
      for (const title of titles) {
        const targetDocId = titleToDocId.get(title)
        if (targetDocId && targetDocId !== srcDocId && nodeIds.has(`doc:${targetDocId}`)) {
          addLink(`doc:${srcDocId}`, `doc:${targetDocId}`, 'references')
        }
      }
    }
  }

  return { nodes, links }
}

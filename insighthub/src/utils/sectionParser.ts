import { useDocumentStore } from '@/stores/documentStore'
import type { Document } from '@/types'

export interface ParsedSection {
  index: number
  title: string
  level: 2 | 3
  contentHtml: string
}

const cache = new Map<string, ParsedSection[]>()

export function invalidateSectionCache(docId?: string) {
  if (docId) {
    cache.delete(docId)
  } else {
    cache.clear()
  }
}

function getDocumentUrl(doc: Document): string {
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

  return `/docs/${doc.source}${middle}/${doc.fileName}`
}

export async function parseSections(docId: string): Promise<ParsedSection[]> {
  const cached = cache.get(docId)
  if (cached) return cached

  const doc = useDocumentStore.getState().documents.get(docId)
  if (!doc) return []

  const url = getDocumentUrl(doc)
  let html: string

  try {
    const resp = await fetch(url)
    html = await resp.text()
  } catch {
    return []
  }

  const parser = new DOMParser()
  const dom = parser.parseFromString(html, 'text/html')
  const body = dom.body
  if (!body) return []

  // Use TreeWalker to find ALL h2/h3 at any nesting level.
  // This must match exactly what the iframe setup script does in PresentationPage.
  const headings: { el: Element; level: 2 | 3 }[] = []
  const walker = dom.createTreeWalker(body, NodeFilter.SHOW_ELEMENT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const el = node as Element
    const tag = el.tagName
    if (tag === 'H2' || tag === 'H3') {
      headings.push({ el, level: tag === 'H2' ? 2 : 3 })
    }
  }

  if (headings.length === 0) {
    // No headings — one section with all content
    const sections: ParsedSection[] = [{
      index: 0,
      title: doc.title || 'Untitled',
      level: 2,
      contentHtml: body.innerHTML,
    }]
    cache.set(docId, sections)
    return sections
  }

  // Build sections. For each heading[i], content = elements between heading[i]
  // and heading[i+1] in document order. Use Range to extract HTML cleanly.
  const sections: ParsedSection[] = []
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i]
    const title = heading.el.textContent?.trim() || `Section ${i + 1}`

    let contentHtml = ''

    // Collect content nodes between this heading and the next heading
    // We walk from the heading's next sibling forward, and also recurse into
    // the heading's parent's siblings when we exhaust the heading subtree.
    const nextHeading = headings[i + 1]?.el
    const range = dom.createRange()

    if (nextHeading) {
      range.setStartAfter(heading.el)
      range.setEndBefore(nextHeading)
    } else {
      range.setStartAfter(heading.el)
      range.setEnd(body, body.childNodes.length)
    }

    // Extract content: clone the range contents, then serialize
    const fragment = range.cloneContents()
    const container = dom.createElement('div')
    container.appendChild(fragment)
    contentHtml = container.innerHTML

    sections.push({
      index: i,
      title,
      level: heading.level,
      contentHtml,
    })
  }

  cache.set(docId, sections)
  return sections
}

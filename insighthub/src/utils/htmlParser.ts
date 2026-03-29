import type { Document, Section } from '@/types'
import type { DocumentManifestEntry } from './documentManifest'

const TITLE_SUFFIXES = [
  ' - MindInsight',
  ' - TechInsight',
  '| 思想洞察 MindInsight',
  '| 技术洞察 TechInsight',
]

function stripTitleSuffix(title: string): string {
  let cleaned = title
  for (const suffix of TITLE_SUFFIXES) {
    if (cleaned.endsWith(suffix)) {
      cleaned = cleaned.slice(0, -suffix.length).trim()
    }
    if (cleaned.includes(suffix)) {
      cleaned = cleaned.replace(suffix, '').trim()
    }
  }
  return cleaned.replace(/\s+/g, ' ').trim()
}

function extractSections(doc: Document): Element[] {
  return Array.from(doc.querySelectorAll('h2, h3'))
}

function countWords(text: string): number {
  const cjkMatches = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)
  const cjkCount = cjkMatches ? cjkMatches.length : 0
  const latinText = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ')
  const latinCount = latinText.split(/\s+/).filter(w => w.length > 0).length
  return cjkCount + latinCount
}

function detectLanguage(text: string): 'zh' | 'en' | 'mixed' {
  const cjkMatches = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)
  const cjkCount = cjkMatches ? cjkMatches.length : 0
  const latinMatches = text.match(/[a-zA-Z]/g)
  const latinCount = latinMatches ? latinMatches.length : 0
  const total = cjkCount + latinCount
  if (total === 0) return 'en'
  const cjkRatio = cjkCount / total
  if (cjkRatio > 0.7) return 'zh'
  if (cjkRatio < 0.2) return 'en'
  return 'mixed'
}

function resolveDocPath(entry: DocumentManifestEntry): string {
  const categoryPath = entry.subcategory
    ? `${entry.category}/${entry.subcategory}`
    : entry.category
  if (import.meta.env.DEV) {
    return `/dev-docs/${entry.source}/${categoryPath}/${entry.fileName}`
  }
  return `/docs/${entry.source}/${categoryPath}/${entry.fileName}`
}

export function parseHtmlDocument(html: string, entry: DocumentManifestEntry): Omit<Document, 'isRead' | 'lastReadAt' | 'readCount' | 'tags' | 'indexedAt'> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // Extract title
  const titleEl = doc.querySelector('title')
  const rawTitle = titleEl?.textContent || entry.fileName.replace(/\.html$/, '')
  const title = stripTitleSuffix(rawTitle)

  // Remove non-content elements
  const removeSelectors = ['script', 'style', 'nav', 'footer', 'header', 'noscript']
  for (const selector of removeSelectors) {
    doc.querySelectorAll(selector).forEach(el => el.remove())
  }

  // Extract text content
  const contentText = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim()

  // Extract sections
  const headings = extractSections(doc)
  const sections: Section[] = headings.map((el, i) => ({
    id: `section-${i}`,
    title: el.textContent?.trim() || '',
    level: el.tagName === 'H2' ? 2 : 3,
  }))

  // Word count & language
  const wordCount = countWords(contentText)
  const language = detectLanguage(contentText)

  return {
    id: entry.id,
    title,
    filePath: entry.filePath,
    fileName: entry.fileName,
    source: entry.source,
    category: entry.category,
    subcategory: entry.subcategory,
    language,
    wordCount,
    sections,
    contentText,
  }
}

export async function fetchAndParseDocument(entry: DocumentManifestEntry): Promise<Document> {
  const url = resolveDocPath(entry)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }
  const html = await response.text()
  const parsed = parseHtmlDocument(html, entry)
  return {
    ...parsed,
    isRead: false,
    readCount: 0,
    tags: [],
    indexedAt: Date.now(),
  }
}

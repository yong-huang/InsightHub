import type { Document, Section } from '@/types'
import type { DocumentManifestEntry } from './documentManifest'

function stripTitleSuffix(title: string, suffixes: string[]): string {
  let cleaned = title
  for (const suffix of suffixes) {
    if (cleaned.endsWith(suffix)) {
      cleaned = cleaned.slice(0, -suffix.length).trim()
    }
    if (cleaned.includes(suffix)) {
      cleaned = cleaned.replace(suffix, '').trim()
    }
  }
  return cleaned.replace(/\s+/g, ' ').trim()
}

function extractSections(doc: globalThis.Document): Element[] {
  return Array.from(doc.querySelectorAll('h2, h3'))
}

function analyzeText(text: string): { wordCount: number; language: 'zh' | 'en' | 'mixed' } {
  const cjkMatches = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)
  const cjkCount = cjkMatches ? cjkMatches.length : 0
  // Replace CJK with spaces, then count Latin words
  const latinText = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ')
  const latinWords = latinText.split(/\s+/).filter(w => w.length > 0)
  const latinCount = latinWords.length

  const wordCount = cjkCount + latinCount

  // Language detection from same counts
  const latinCharMatches = text.match(/[a-zA-Z]/g)
  const latinCharCount = latinCharMatches ? latinCharMatches.length : 0
  const total = cjkCount + latinCharCount
  let language: 'zh' | 'en' | 'mixed'
  if (total === 0) {
    language = 'en'
  } else {
    const cjkRatio = cjkCount / total
    language = cjkRatio > 0.7 ? 'zh' : cjkRatio < 0.2 ? 'en' : 'mixed'
  }

  return { wordCount, language }
}

function resolveDocPath(entry: DocumentManifestEntry): string {
  const categoryPath = entry.subcategory
    ? `${entry.category}/${entry.subcategory}`
    : entry.category
  const middle = categoryPath ? `/${categoryPath}` : ''
  if (import.meta.env.DEV) {
    return `/dev-docs/${entry.source}${middle}/${entry.fileName}`
  }
  return `/docs/${entry.source}${middle}/${entry.fileName}`
}

export function parseHtmlDocument(html: string, entry: DocumentManifestEntry, titleSuffixes: string[] = []): Omit<Document, 'isRead' | 'lastReadAt' | 'readCount' | 'tags' | 'indexedAt'> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // Extract title
  const titleEl = doc.querySelector('title')
  const rawTitle = titleEl?.textContent || entry.fileName.replace(/\.html$/, '')
  const title = stripTitleSuffix(rawTitle, titleSuffixes)

  // Remove non-content elements
  const removeSelectors = ['script', 'style', 'nav', 'footer', 'header', 'noscript']
  for (const selector of removeSelectors) {
    doc.querySelectorAll(selector).forEach(el => el.remove())
  }

  // Extract text content
  const contentText = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim()

  // Extract sections
  const headings = extractSections(doc as globalThis.Document)
  const sections: Section[] = headings.map((el, i) => ({
    id: `section-${i}`,
    title: el.textContent?.trim() || '',
    level: el.tagName === 'H2' ? 2 : 3,
  }))

  // Word count & language (single pass)
  const { wordCount, language } = analyzeText(contentText)

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

export async function fetchAndParseDocument(entry: DocumentManifestEntry, titleSuffixes: string[] = []): Promise<Document> {
  const url = resolveDocPath(entry)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }
  const html = await response.text()
  const parsed = parseHtmlDocument(html, entry, titleSuffixes)
  return {
    ...parsed,
    isRead: false,
    readCount: 0,
    tags: [],
    indexedAt: Date.now(),
  }
}

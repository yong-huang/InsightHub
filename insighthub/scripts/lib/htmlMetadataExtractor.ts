import * as fs from 'fs'

export interface HtmlMetadata {
  title: string
  contentSnippet: string // first 8000 chars of cleaned body text
  wordCount: number
  language: 'zh' | 'en' | 'mixed'
  sections: Array<{ id: string; title: string; level: 2 | 3 }>
}

const REMOVE_TAGS = ['script', 'style', 'nav', 'footer', 'header', 'noscript']
const REMOVE_BLOCK = new RegExp(
  `<(?:${REMOVE_TAGS.join('|')})[^>]*>[\\s\\S]*?</(?:${REMOVE_TAGS.join('|')})>`,
  'gi'
)

function analyzeText(text: string): { wordCount: number; language: 'zh' | 'en' | 'mixed' } {
  const cjkMatches = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)
  const cjkCount = cjkMatches ? cjkMatches.length : 0
  const latinText = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ')
  const latinWords = latinText.split(/\s+/).filter(w => w.length > 0)
  const latinCount = latinWords.length
  const wordCount = cjkCount + latinCount

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

function decodeHtmlEntities(text: string): string {
  return text.replace(/&#[xX][\da-fA-F]+;|&#\d+;|&\w+;/g, e => {
    if (e.startsWith('&#x') || e.startsWith('&#X')) return String.fromCodePoint(parseInt(e.slice(3, -1), 16))
    if (e.startsWith('&#')) return String.fromCodePoint(parseInt(e.slice(2, -1)))
    const entities: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': '\u00a0' }
    return entities[e] || e
  })
}

export function extractHtmlMetadata(html: string): HtmlMetadata {
  // Title (decode HTML entities like &#x90E8; → 部)
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : ''

  // Remove non-content block elements
  const cleaned = html.replace(REMOVE_BLOCK, '')

  // Extract body content
  const bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  const bodyContent = bodyMatch ? bodyMatch[1] : cleaned

  // Strip all remaining HTML tags
  const textContent = bodyContent.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

  // Content snippet — first 8000 chars
  const contentSnippet = textContent.slice(0, 8000)

  // Word count & language
  const { wordCount, language } = analyzeText(textContent)

  // Sections — h2 and h3 headings
  const sections: HtmlMetadata['sections'] = []
  let sectionIndex = 0
  const headingRegex = /<(h[23])[^>]*>([\s\S]*?)<\/\1>/gi
  let headingMatch: RegExpExecArray | null
  while ((headingMatch = headingRegex.exec(bodyContent)) !== null) {
    const level = headingMatch[1] === 'h2' ? 2 : 3
    const headingContent = decodeHtmlEntities(headingMatch[2].replace(/<[^>]+>/g, '').trim())
    if (headingContent) {
      sections.push({ id: `section-${sectionIndex++}`, title: headingContent, level })
    }
  }

  return { title, contentSnippet, wordCount, language, sections }
}

export function extractHtmlMetadataFromFile(filePath: string): HtmlMetadata {
  const html = fs.readFileSync(filePath, 'utf-8')
  return extractHtmlMetadata(html)
}

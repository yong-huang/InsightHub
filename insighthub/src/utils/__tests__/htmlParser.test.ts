import { describe, it, expect } from 'vitest'
import { parseHtmlDocument } from '../htmlParser'
import type { DocumentManifestEntry } from '@/services/documentManifest'

function makeEntry(overrides: Partial<DocumentManifestEntry> = {}): DocumentManifestEntry {
  return {
    id: 'test-doc-1',
    source: 'mi',
    fileName: 'test.html',
    filePath: '/path/to/test.html',
    category: 'python',
    ...overrides,
  }
}

describe('parseHtmlDocument', () => {
  it('extracts title from <title>', () => {
    const html = '<html><head><title>Python Basics</title></head><body><p>Hello world</p></body></html>'
    const result = parseHtmlDocument(html, makeEntry())
    expect(result.title).toBe('Python Basics')
  })

  it('falls back to fileName when no <title>', () => {
    const html = '<html><body><p>Content</p></body></html>'
    const result = parseHtmlDocument(html, makeEntry({ fileName: 'my-doc.html' }))
    expect(result.title).toBe('my-doc')
  })

  it('strips title suffixes', () => {
    const html = '<html><head><title>Python Basics - My Site</title></head><body><p>X</p></body></html>'
    const result = parseHtmlDocument(html, makeEntry(), ['- My Site'])
    expect(result.title).toBe('Python Basics')
  })

  it('removes script and style elements from content', () => {
    const html = `<html><head><title>T</title>
      <script>var x = 1;</script>
      <style>body { color: red; }</style>
    </head><body>
      <p>Real content</p>
      <script>alert('hi')</script>
    </body></html>`
    const result = parseHtmlDocument(html, makeEntry())
    expect(result.contentText).not.toContain('var x = 1')
    expect(result.contentText).not.toContain('color: red')
    expect(result.contentText).not.toContain('alert')
    expect(result.contentText).toContain('Real content')
  })

  it('removes nav, footer, header elements', () => {
    const html = `<html><body>
      <header>Site Header</header>
      <nav>Navigation Links</nav>
      <main>Real content here</main>
      <footer>Site Footer</footer>
    </body></html>`
    const result = parseHtmlDocument(html, makeEntry())
    expect(result.contentText).not.toContain('Site Header')
    expect(result.contentText).not.toContain('Navigation Links')
    expect(result.contentText).not.toContain('Site Footer')
    expect(result.contentText).toContain('Real content here')
  })

  it('normalizes whitespace in contentText', () => {
    const html = `<html><body><p>Hello    world</p>
      <p>Next   line</p></body></html>`
    const result = parseHtmlDocument(html, makeEntry())
    expect(result.contentText).not.toMatch(/\s{2,}/)
    expect(result.contentText.trim()).toBe(result.contentText)
  })

  it('extracts h2/h3 sections', () => {
    const html = `<html><body>
      <h2>Chapter One</h2>
      <p>Content 1</p>
      <h3>Subsection 1.1</h3>
      <p>Content 2</p>
    </body></html>`
    const result = parseHtmlDocument(html, makeEntry())
    expect(result.sections).toHaveLength(2)
    expect(result.sections[0].title).toBe('Chapter One')
    expect(result.sections[0].level).toBe(2)
    expect(result.sections[1].title).toBe('Subsection 1.1')
    expect(result.sections[1].level).toBe(3)
  })

  it('returns correct entry metadata', () => {
    const entry = makeEntry({ id: 'custom-id', source: 'ti', category: 'rust', subcategory: 'advanced' })
    const html = '<html><body><p>Content</p></body></html>'
    const result = parseHtmlDocument(html, entry)
    expect(result.id).toBe('custom-id')
    expect(result.source).toBe('ti')
    expect(result.category).toBe('rust')
    expect(result.subcategory).toBe('advanced')
    expect(result.fileName).toBe('test.html')
  })
})

describe('language detection', () => {
  it('detects all Chinese text as zh', () => {
    const html = '<html><body><p>这是一个关于机器学习的文档。深度学习是人工智能的分支。</p></body></html>'
    const result = parseHtmlDocument(html, makeEntry())
    expect(result.language).toBe('zh')
  })

  it('detects all English text as en', () => {
    const html = '<html><body><p>Machine learning is a subset of artificial intelligence. It focuses on building systems that learn from data.</p></body></html>'
    const result = parseHtmlDocument(html, makeEntry())
    expect(result.language).toBe('en')
  })

  it('detects mixed content as mixed', () => {
    const html = '<html><body><p>Python是一种编程语言。It is used for web development and data science.机器学习框架TensorFlow很流行。</p></body></html>'
    const result = parseHtmlDocument(html, makeEntry())
    expect(result.language).toBe('mixed')
  })

  it('detects empty content as en', () => {
    const html = '<html><body></body></html>'
    const result = parseHtmlDocument(html, makeEntry())
    expect(result.language).toBe('en')
  })
})

describe('word count', () => {
  it('counts Chinese characters individually', () => {
    const html = '<html><body><p>人工智能深度学习</p></body></html>'
    const result = parseHtmlDocument(html, makeEntry())
    expect(result.wordCount).toBe(8)
  })

  it('counts Latin words by spaces', () => {
    const html = '<html><body><p>Hello world this is a test</p></body></html>'
    const result = parseHtmlDocument(html, makeEntry())
    expect(result.wordCount).toBe(6)
  })

  it('counts combined Chinese and Latin words', () => {
    const html = '<html><body><p>Python编程语言</p></body></html>'
    const result = parseHtmlDocument(html, makeEntry())
    // analyzeText: CJK chars (编程语言 = 4 CJK chars? Let's check)
    // 编 = CJK, 程 = CJK, 语 = CJK, 言 = CJK → 4 CJK
    // Latin text after replacing CJK: "Python    " → ["Python"] → 1 word
    // wordCount = 4 + 1 = 5
    expect(result.wordCount).toBe(5)
  })
})

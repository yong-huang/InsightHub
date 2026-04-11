import { Link } from 'react-router-dom'

interface WikiLinkRendererProps {
  text: string
  titleLookup: Map<string, string>
}

const WIKI_LINK_RE = /(\[\[([^\]]+)\]\])/g

/** Split text by [[title]] patterns and render links or unresolved spans */
export function WikiLinkRenderer({ text, titleLookup }: WikiLinkRendererProps) {
  if (!text) return null

  const parts: (string | { title: string; docId: string | null })[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  const re = new RegExp(WIKI_LINK_RE.source, WIKI_LINK_RE.flags)

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const title = match[2].trim()
    const docId = titleLookup.get(title) ?? null
    parts.push({ title, docId })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return (
    <>
      {parts.map((part, i) => {
        if (typeof part === 'string') return part
        if (part.docId) {
          return (
            <Link
              key={i}
              to={`/doc/${part.docId}`}
              className="wiki-link"
              onClick={e => e.stopPropagation()}
            >
              {part.title}
            </Link>
          )
        }
        return (
          <span key={i} className="wiki-link-unresolved">{part.title}</span>
        )
      })}
    </>
  )
}

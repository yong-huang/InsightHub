import { Link, useLocation } from 'react-router-dom'
import { CheckCircle2, Circle, FileText, Clock } from 'lucide-react'
import type { Document } from '@/types'
import { getCategoryInfo } from '@/utils/categoryMap'
import { highlightText } from '@/services/searchService'
import { getShortLabel, getSourceColor, getSourceColorBg } from '@/utils/workspaceUtils'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { prefetchRoute } from '@/utils/prefetchRoute'
import { useMemo, memo } from 'react'

interface DocCardProps {
  doc: Document
  snippet?: string
  query?: string
}

/** Render highlighted text with <mark> tags */
const HighlightedSnippet = memo(function HighlightedSnippet({ text, query }: { text: string; query: string }) {
  const highlighted = useMemo(() => highlightText(text, query), [text, query])
  if (!highlighted.includes('⫷')) return <>{highlighted}</>
  const parts = highlighted.split(/([⫷⫸])/)
  const nodes: React.ReactNode[] = []
  let inMark = false
  for (const part of parts) {
    if (part === '⫷') { inMark = true; continue }
    if (part === '⫸') { inMark = false; continue }
    if (inMark) {
      nodes.push(<mark key={nodes.length} className="search-highlight">{part}</mark>)
    } else {
      nodes.push(part)
    }
  }
  return <>{nodes}</>
})

export const DocCard = memo(function DocCard({ doc, snippet, query }: DocCardProps) {
  const catInfo = getCategoryInfo(doc.category)
  const location = useLocation()
  const workspaces = usePreferenceStore(s => s.workspaces)

  return (
    <Link to={`/doc/${doc.id}`} state={{ from: location.pathname }} className="doc-card card card-hover" onMouseEnter={() => prefetchRoute('/doc')}>
      <div className="doc-card-header">
        <span className="badge" style={{ background: getSourceColorBg(doc.source, workspaces), color: getSourceColor(doc.source, workspaces) }}>
          {getShortLabel(doc.source, workspaces)}
        </span>
        <span className={`badge ${doc.isRead ? 'badge-read' : 'badge-unread'}`}>
          {doc.isRead ? <CheckCircle2 size={12} /> : <Circle size={12} />}
          {doc.isRead ? 'Read' : 'Unread'}
        </span>
      </div>

      <h3 className="doc-card-title">{doc.title}</h3>

      <div className="doc-card-meta">
        {catInfo && (
          <span className="doc-card-category">
            {catInfo.label}
            {doc.subcategory && <span className="doc-card-subcategory">/ {doc.subcategory}</span>}
          </span>
        )}
        <span className="doc-card-words">
          <FileText size={13} />
          {doc.wordCount.toLocaleString()} words
        </span>
      </div>

      {snippet && query && (
        <div className="doc-card-snippet">
          <HighlightedSnippet text={snippet} query={query} />
        </div>
      )}

      {doc.lastReadAt && (
        <div className="doc-card-read-info">
          <Clock size={12} />
          {new Date(doc.lastReadAt).toLocaleDateString('en-US')}
        </div>
      )}
    </Link>
  )
})

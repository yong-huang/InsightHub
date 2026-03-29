import type { Document } from '@/types'
import { DocCard } from './DocCard'
import { Inbox } from 'lucide-react'

interface DocGridProps {
  documents: Document[]
  emptyMessage?: string
}

export function DocGrid({ documents, emptyMessage = '暂无文档' }: DocGridProps) {
  if (documents.length === 0) {
    return (
      <div className="empty-state">
        <Inbox size={48} />
        <h3>{emptyMessage}</h3>
      </div>
    )
  }

  return (
    <div className="doc-grid grid-3">
      {documents.map(doc => (
        <DocCard key={doc.id} doc={doc} />
      ))}
    </div>
  )
}

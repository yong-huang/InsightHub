import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, FileText, Clock } from 'lucide-react'
import type { Document } from '@/types'
import { getCategoryInfo } from '@/utils/categoryMap'

interface DocCardProps {
  doc: Document
}

export function DocCard({ doc }: DocCardProps) {
  const catInfo = getCategoryInfo(doc.category)

  return (
    <Link to={`/doc/${doc.id}`} className="doc-card card card-hover">
      <div className="doc-card-header">
        <span className={`badge badge-${doc.source}`}>
          {doc.source === 'mindinsight' ? 'Mind' : 'Tech'}
        </span>
        <span className={`badge ${doc.isRead ? 'badge-read' : 'badge-unread'}`}>
          {doc.isRead ? <CheckCircle2 size={12} /> : <Circle size={12} />}
          {doc.isRead ? '已读' : '未读'}
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
          {doc.wordCount.toLocaleString()} 字
        </span>
      </div>

      {doc.lastReadAt && (
        <div className="doc-card-read-info">
          <Clock size={12} />
          {new Date(doc.lastReadAt).toLocaleDateString('zh-CN')}
        </div>
      )}
    </Link>
  )
}

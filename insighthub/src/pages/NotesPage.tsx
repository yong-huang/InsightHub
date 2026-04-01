import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, MessageSquare, Search, FileText } from 'lucide-react'
import { useAnnotationStore } from '@/stores/annotationStore'
import { useDocumentStore } from '@/stores/documentStore'
import { usePreferenceStore } from '@/stores/preferenceStore'

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function NotesPage() {
  const navigate = useNavigate()
  const annotations = useAnnotationStore(s => s.annotations)
  const documents = useDocumentStore(s => s.documents)
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const [searchQuery, setSearchQuery] = useState('')

  // Only show comments in the notes page, filtered by active workspace
  const commentAnnotations = useMemo(() => {
    return annotations
      .filter(a => a.type === 'comment')
      .filter(a => documents.get(a.documentId)?.source === activeWorkspace)
      .filter(a => {
        if (!searchQuery.trim()) return true
        const q = searchQuery.toLowerCase()
        const doc = documents.get(a.documentId)
        return (
          a.text.toLowerCase().includes(q) ||
          (a.comment && a.comment.toLowerCase().includes(q)) ||
          (doc?.title.toLowerCase().includes(q))
        )
      })
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [annotations, activeWorkspace, searchQuery, documents])

  const commentCount = commentAnnotations.length

  return (
    <div className="page-notes">
      <div className="page-header">
        <h1><MessageSquare size={24} style={{ marginRight: 8, verticalAlign: 'middle' }} /> 笔记</h1>
        <p>查看所有文档批注，点击可跳转到对应位置</p>
      </div>

      {annotations.length === 0 ? (
        <div className="empty-state">
          <BookOpen size={48} />
          <h3>暂无批注</h3>
          <p>在文档中选中文本并添加批注后，会显示在这里</p>
        </div>
      ) : (
        <>
          <div className="filter-bar">
            <div className="filter-group">
              <span className="badge" style={{ fontSize: '0.8rem' }}>
                {commentCount} 条批注
              </span>
            </div>
            <div className="search-page-input-wrap" style={{ flex: '1 1 240px', minWidth: 200 }}>
              <Search size={16} />
              <input
                type="search"
                className="search-page-input"
                placeholder="搜索批注..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {commentAnnotations.length === 0 ? (
            <div className="empty-state" style={{ padding: '3rem 2rem' }}>
              <Search size={40} />
              <h3>未找到匹配的批注</h3>
            </div>
          ) : (
            <div className="notes-list">
              {commentAnnotations.map(ann => {
                const doc = documents.get(ann.documentId)
                return (
                  <div
                    key={ann.id}
                    className="notes-item card"
                    onClick={() =>
                      navigate(`/doc/${ann.documentId}`, {
                        state: {
                          from: '/notes',
                          scrollToAnnotation: ann.id,
                        },
                      })
                    }
                  >
                    <div className="notes-item-header">
                      <div
                        className="notes-item-color"
                        style={{ backgroundColor: ann.color }}
                      />
                      {doc ? (
                        <span className="notes-item-title">
                          <FileText size={14} />
                          {doc.title}
                        </span>
                      ) : (
                        <span className="notes-item-title notes-item-title-missing">
                          文档已删除
                        </span>
                      )}
                      {doc && (
                        <span className={`badge badge-${doc.source}`}>
                          {doc.source === 'mindinsight' ? 'Mind' : 'Tech'}
                        </span>
                      )}
                      <span className="notes-item-time">{formatTime(ann.createdAt)}</span>
                    </div>
                    <p className="notes-item-text">{ann.text}</p>
                    {ann.comment && (
                      <p className="notes-item-comment">
                        <MessageSquare size={12} />
                        {ann.comment}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

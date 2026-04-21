import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Play, Edit3, Trash2, Presentation, FileText } from 'lucide-react'
import { usePresentationStore } from '@/stores/presentationStore'
import { useDocumentStore } from '@/stores/documentStore'

export function PresentationListPage() {
  const loadPresentations = usePresentationStore(s => s.loadPresentations)
  const presentations = usePresentationStore(s => s.presentations)
  const deletePresentation = usePresentationStore(s => s.deletePresentation)
  const documents = useDocumentStore(s => s.documents)

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  useEffect(() => {
    loadPresentations()
  }, [loadPresentations])

  const handleDelete = (id: string) => {
    if (confirmDelete === id) {
      deletePresentation(id)
      setConfirmDelete(null)
    } else {
      setConfirmDelete(id)
      setTimeout(() => setConfirmDelete(null), 3000)
    }
  }

  const formatDate = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  if (presentations.length === 0) {
    return (
      <div className="presentation-list-page">
        <h1>Presentations</h1>
        <div className="presentation-empty">
          <Presentation size={48} style={{ opacity: 0.3 }} />
          <p style={{ color: 'var(--text-tertiary)' }}>No presentations yet</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>
            Open a document and click the Present button to create one
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="presentation-list-page">
      <h1>Presentations ({presentations.length})</h1>
      <div className="presentation-list-grid">
        {presentations.map(p => {
          const doc = documents.get(p.documentId)
          return (
            <div key={p.id} className="presentation-list-card">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <FileText size={16} style={{ color: 'var(--text-tertiary)' }} />
                  {doc && (
                    <span className={`badge badge-${doc.source}`} style={{ fontSize: '0.7rem' }}>
                      {doc.source === 'mindinsight' ? 'Mind' : doc.source === 'techinsight' ? 'Tech' : 'LC'}
                    </span>
                  )}
                </div>
                <div className="presentation-list-card-title">{p.documentTitle}</div>
              </div>
              <div className="presentation-list-card-meta">
                <span>{p.slideOrder.length} slides</span>
                <span>{formatDate(p.updatedAt)}</span>
              </div>
              <div className="presentation-list-card-actions">
                <Link
                  to={`/presentation/${p.documentId}`}
                  className="btn-play"
                >
                  <Play size={14} /> Present
                </Link>
                <Link
                  to={`/presentation/${p.documentId}/edit`}
                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-primary)', padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  <Edit3 size={14} /> Edit
                </Link>
                <button
                  className="btn-delete"
                  onClick={() => handleDelete(p.id)}
                >
                  {confirmDelete === p.id ? 'Confirm?' : <Trash2 size={14} />}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

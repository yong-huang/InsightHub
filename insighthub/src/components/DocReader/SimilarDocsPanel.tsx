import { useNavigate } from 'react-router-dom'
import { GitBranch, X, Maximize, Minimize, ExternalLink } from 'lucide-react'
import { getSimilarDocuments } from '@/services/similarityService'
import { useDocumentStore } from '@/stores/documentStore'
import { getCategoryInfo } from '@/utils/categoryMap'

interface SimilarDocsPanelProps {
  docId: string
  onClose: () => void
  poppedOut?: boolean
  onTogglePopup?: () => void
}

export function SimilarDocsPanel({ docId, onClose, poppedOut, onTogglePopup }: SimilarDocsPanelProps) {
  const navigate = useNavigate()
  const documents = useDocumentStore(s => s.documents)
  const similar = getSimilarDocuments(docId, 10)

  const panelContent = (
    <>
      <div className="summary-panel-header">
        <h3>Similar Documents</h3>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button className="summary-panel-close" onClick={onTogglePopup} title={poppedOut ? 'Minimize' : 'Expand'}>
            {poppedOut ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
          <button className="summary-panel-close" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="summary-panel-body">
        {similar.length === 0 && (
          <div className="summary-panel-empty">
            <GitBranch size={32} />
            <p>No Similar Documents</p>
            <p className="summary-panel-empty-hint">Similarity analysis is still processing or no matches were found</p>
          </div>
        )}

        {similar.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {similar.map(item => {
              const doc = documents.get(item.docId)
              if (!doc) return null
              const catInfo = getCategoryInfo(doc.category)
              return (
                <button
                  key={item.docId}
                  className="similar-doc-item"
                  onClick={() => navigate(`/doc/${item.docId}`)}
                >
                  <div className="similar-doc-title-row">
                    <span className="similar-doc-title">{doc.title}</span>
                    <ExternalLink size={12} className="similar-doc-link-icon" />
                  </div>
                  <div className="similar-doc-meta">
                    <span className="badge" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>{catInfo.label}</span>
                    {item.reasons.map((r, i) => (
                      <span key={i} className="similar-doc-reason">{r}</span>
                    ))}
                  </div>
                  <div className="similar-doc-bar-track">
                    <div
                      className="similar-doc-bar-fill"
                      style={{ width: `${Math.round(item.score * 100)}%` }}
                    />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </>
  )

  if (poppedOut) {
    return (
      <div className="summary-panel-overlay" onClick={(e) => { if (e.target === e.currentTarget) onTogglePopup?.() }}>
        <div className="summary-panel-popup">
          <div className="summary-panel">
            {panelContent}
          </div>
        </div>
      </div>
    )
  }

  return <div className="summary-panel">{panelContent}</div>
}

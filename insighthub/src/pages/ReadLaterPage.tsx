import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bookmark, Search, X } from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { storageService } from '@/services/storageService'
import { getCategoryInfo } from '@/utils/categoryMap'
import { getShortLabel } from '@/utils/workspaceUtils'

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ReadLaterPage() {
  const navigate = useNavigate()
  const documents = useDocumentStore(s => s.documents)
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const workspaces = usePreferenceStore(s => s.workspaces)
  const [searchQuery, setSearchQuery] = useState('')
  const [list, setList] = useState(() => storageService.getReadLaterList())

  // Refresh list on storage events (e.g. from DocReaderPage)
  useEffect(() => {
    const refresh = () => setList(storageService.getReadLaterList())
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [])

  const items = useMemo(() => {
    return list
      .filter(item => {
        const doc = documents.get(item.documentId)
        if (!doc) return false
        if (doc.source !== activeWorkspace) return false
        if (!searchQuery.trim()) return true
        const q = searchQuery.toLowerCase()
        return doc.title.toLowerCase().includes(q)
      })
      .map(item => ({
        ...item,
        doc: documents.get(item.documentId)!,
        catInfo: getCategoryInfo(documents.get(item.documentId)!.category),
      }))
      .sort((a, b) => b.addedAt - a.addedAt)
  }, [list, searchQuery, documents, activeWorkspace])

  const handleRemove = (documentId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    storageService.removeFromReadLater(documentId)
    setList(storageService.getReadLaterList())
    window.dispatchEvent(new Event('storage'))
  }

  return (
    <div className="cs-settings">
      {/* Page header */}
      <div className="cs-settings-header">
        <div className="cs-section-label">READ LATER</div>
        <h1>Read Later</h1>
        <p className="cs-settings-subtitle">
          Bookmarked documents will automatically restore last reading position.
        </p>
      </div>

      {/* Bookmarks card */}
      <div className="cs-card">
        <div className="cs-card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Bookmark size={16} />
            BOOKMARKS
            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 'normal' }}>
              {items.length} docs
            </span>
          </div>
        </div>
        <div className="cs-card-body">
          {/* Search */}
          {list.length > 0 && (
            <div className="cs-search-wrap">
              <Search size={14} />
              <input
                type="search"
                className="cs-search-input"
                placeholder="Search bookmarks..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          )}

          {list.length === 0 ? (
            <div className="cs-empty-hint">
              <Bookmark size={32} style={{ opacity: 0.3, marginBottom: '0.5rem', display: 'block' }} />
              Click the bookmark button on a document to add it here.
            </div>
          ) : items.length === 0 ? (
            <div className="cs-empty-hint">No matching documents.</div>
          ) : (
            <div className="cs-item-list">
              {items.map(item => (
                <div
                  key={item.documentId}
                  className="cs-model-item"
                  onClick={() =>
                    navigate(`/doc/${item.documentId}`, { state: { from: '/read-later' } })
                  }
                >
                  <div className="cs-model-info">
                    <div className="cs-model-name">
                      {item.doc.title}
                      <span className="cs-badge" style={{
                        background: 'rgba(50, 108, 229, 0.08)',
                        color: 'var(--accent-blue)',
                        border: '1px solid rgba(50, 108, 229, 0.15)',
                      }}>
                        {getShortLabel(item.doc.source, workspaces)}
                      </span>
                      {item.catInfo && <span className="cs-badge">{item.catInfo.label}</span>}
                    </div>
                    <div className="cs-model-meta">
                      <span>{item.doc.wordCount.toLocaleString()} words</span>
                      <span>{formatTime(item.addedAt)}</span>
                    </div>
                  </div>
                  <button
                    className="cs-btn cs-btn-ghost cs-rl-remove"
                    onClick={e => handleRemove(item.documentId, e)}
                    title="Remove"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

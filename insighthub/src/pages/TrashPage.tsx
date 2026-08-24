import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Trash2, Search, Undo2 } from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { storageService } from '@/services/storageService'
import { getCategoryInfo } from '@/utils/categoryMap'
import { getShortLabel } from '@/utils/workspaceUtils'

interface TrashedDoc {
  docId: string
  trashedAt: number
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function TrashPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const documents = useDocumentStore(s => s.documents)
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const workspaces = usePreferenceStore(s => s.workspaces)
  const [searchQuery, setSearchQuery] = useState('')
  const [trashedDocs, setTrashedDocs] = useState<TrashedDoc[]>(() => storageService.getTrashedDocs())
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [confirmEmpty, setConfirmEmpty] = useState(false)

  useEffect(() => {
    const refresh = () => setTrashedDocs(storageService.getTrashedDocs())
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [])

  const items = useMemo(() => {
    return trashedDocs
      .filter(t => {
        const doc = documents.get(t.docId)
        if (!doc) return false
        if (doc.source !== activeWorkspace) return false
        if (!searchQuery.trim()) return true
        return doc.title.toLowerCase().includes(searchQuery.toLowerCase())
      })
      .sort((a, b) => b.trashedAt - a.trashedAt)
      .map(t => {
        const doc = documents.get(t.docId)!
        return {
          docId: t.docId,
          doc,
          catInfo: getCategoryInfo(doc.category),
          trashedAt: t.trashedAt,
        }
      })
  }, [trashedDocs, searchQuery, documents, activeWorkspace])

  const handleRestore = (docId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    useDocumentStore.getState().restoreTrashedDocument(docId)
    setTrashedDocs(storageService.getTrashedDocs())
    window.dispatchEvent(new Event('storage'))
  }

  const handleDeleteOne = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const doc = documents.get(docId)
    if (!doc) return

    if (confirmingId !== docId) {
      setConfirmingId(docId)
      return
    }

    setConfirmingId(null)
    if (docId.startsWith('imported-')) {
      try { await useDocumentStore.getState().removeDocument(docId) } catch { /* local-only doc */ }
    } else {
      try {
        await fetch(`/api/workspace-document?id=${encodeURIComponent(docId)}`, { method: 'DELETE' })
      } catch { /* server unavailable — restore locally */ }
    }
    storageService.restoreTrashed(docId)
    setTrashedDocs(storageService.getTrashedDocs())
    window.dispatchEvent(new Event('storage'))
    // Reload to reflect removal
    await useDocumentStore.getState().reloadDocuments()
  }

  const handleEmptyTrash = async () => {
    if (!confirmEmpty) {
      setConfirmEmpty(true)
      return
    }
    setConfirmEmpty(false)
    await useDocumentStore.getState().emptyTrash()
    setTrashedDocs([])
    window.dispatchEvent(new Event('storage'))
  }

  const handleRestoreAll = () => {
    for (const t of trashedDocs) {
      const doc = documents.get(t.docId)
      if (doc?.source === activeWorkspace) {
        useDocumentStore.getState().restoreTrashedDocument(t.docId)
      }
    }
    setTrashedDocs(storageService.getTrashedDocs())
    window.dispatchEvent(new Event('storage'))
  }

  // Restore scroll position
  useEffect(() => {
    const saved = sessionStorage.getItem('trash-scroll')
    if (saved) {
      const timer = setTimeout(() => {
        window.scrollTo(0, Number(saved))
        sessionStorage.removeItem('trash-scroll')
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [location])

  const goDoc = (docId: string) => {
    sessionStorage.setItem('trash-scroll', String(window.scrollY))
    navigate(`/doc/${docId}`, { state: { from: '/trash' } })
  }

  return (
    <div className="cs-settings">
      <div className="cs-settings-header">
        <div className="cs-section-label">TRASH</div>
        <h1>Trash</h1>
        <p className="cs-settings-subtitle">
          Deleted documents can be restored or permanently removed.
        </p>
      </div>

      <div className="cs-card">
        <div className="cs-card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Trash2 size={16} />
            TRASH
            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 'normal' }}>
              {items.length} docs
            </span>
          </div>
          <div className="cs-btn-group">
            {items.length > 0 && (
              <>
                <button className="cs-btn cs-btn-ghost" style={{ fontSize: '0.75rem' }} onClick={handleRestoreAll}>
                  Restore All
                </button>
                <button
                  className={`cs-btn ${confirmEmpty ? 'cs-btn-primary' : 'cs-btn-ghost'}`}
                  style={{ fontSize: '0.75rem', color: confirmEmpty ? undefined : 'var(--accent-red)' }}
                  onClick={handleEmptyTrash}
                >
                  {confirmEmpty ? 'Confirm Empty Trash' : 'Empty Trash'}
                </button>
              </>
            )}
          </div>
        </div>
        <div className="cs-card-body">
          {trashedDocs.length > 0 && (
            <div className="cs-search-wrap">
              <Search size={14} />
              <input
                type="search"
                className="cs-search-input"
                placeholder="Search trashed documents..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          )}

          {trashedDocs.length === 0 ? (
            <div className="cs-empty-hint">
              <Trash2 size={32} style={{ opacity: 0.3, marginBottom: '0.5rem', display: 'block' }} />
              Trash is empty.
            </div>
          ) : items.length === 0 ? (
            <div className="cs-empty-hint">No matching documents.</div>
          ) : (
            <div className="cs-item-list">
              {items.map(item => (
                <div
                  key={item.docId}
                  className="cs-model-item"
                  onClick={() => goDoc(item.docId)}
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
                      <span>Trashed {formatDate(item.trashedAt)}</span>
                    </div>
                  </div>
                  <div className="cs-btn-group">
                    <button
                      className="cs-btn cs-btn-ghost"
                      onClick={e => handleRestore(item.docId, e)}
                      title="Restore"
                    >
                      <Undo2 size={14} />
                      Restore
                    </button>
                    <button
                      className={`cs-btn ${confirmingId === item.docId ? 'cs-btn-primary' : 'cs-btn-ghost'}`}
                      style={{ color: confirmingId === item.docId ? undefined : 'var(--accent-red)' }}
                      onClick={e => handleDeleteOne(item.docId, e)}
                      title={confirmingId === item.docId ? 'Click again to confirm' : 'Delete permanently'}
                    >
                      <Trash2 size={14} />
                      {confirmingId === item.docId ? 'Confirm' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

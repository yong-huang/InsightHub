import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { EyeOff, Search, Undo2, Folder } from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { storageService } from '@/services/storageService'
import { getCategoryInfo } from '@/utils/categoryMap'
import { getShortLabel } from '@/utils/workspaceUtils'

export function HiddenDocsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const documents = useDocumentStore(s => s.documents)
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const workspaces = usePreferenceStore(s => s.workspaces)
  const [searchQuery, setSearchQuery] = useState('')
  const [ids, setIds] = useState<string[]>(() => storageService.getDeprecatedIds())
  const [catKeys, setCatKeys] = useState<string[]>(() => storageService.getDeprecatedCategories())

  useEffect(() => {
    const refresh = () => {
      setIds(storageService.getDeprecatedIds())
      setCatKeys(storageService.getDeprecatedCategories())
    }
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [])

  // Parse deprecated categories for current workspace
  const hiddenCategories = useMemo(() => {
    return catKeys
      .filter(key => key.split(':')[0] === activeWorkspace)
      .map(key => {
        const [, category] = key.split(':')
        const catInfo = getCategoryInfo(category)
        const docCount = Array.from(documents.values())
          .filter(d => d.source === activeWorkspace && d.category === category).length
        return { key, category, catInfo, docCount }
      })
  }, [catKeys, activeWorkspace, documents])

  const items = useMemo(() => {
    return ids
      .filter(id => {
        const doc = documents.get(id)
        if (!doc) return false
        if (doc.source !== activeWorkspace) return false
        if (!searchQuery.trim()) return true
        return doc.title.toLowerCase().includes(searchQuery.toLowerCase())
      })
      .map(id => ({
        docId: id,
        doc: documents.get(id)!,
        catInfo: getCategoryInfo(documents.get(id)!.category),
      }))
  }, [ids, searchQuery, documents, activeWorkspace])

  const handleRestore = (docId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    useDocumentStore.getState().restoreDocument(docId)
    setIds(storageService.getDeprecatedIds())
    window.dispatchEvent(new Event('storage'))
  }

  const handleRestoreAllDocs = () => {
    for (const id of ids) {
      const doc = documents.get(id)
      if (doc?.source === activeWorkspace) {
        storageService.restoreDeprecated(id)
      }
    }
    setIds(storageService.getDeprecatedIds())
    window.dispatchEvent(new Event('storage'))
    useDocumentStore.getState().applyFilters()
  }

  const handleRestoreCategory = (key: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const [source, category] = key.split(':')
    storageService.restoreDeprecatedCategory(source, category)
    setCatKeys(storageService.getDeprecatedCategories())
    window.dispatchEvent(new Event('storage'))
    useDocumentStore.getState().applyFilters()
  }

  const handleRestoreAllCategories = () => {
    for (const key of catKeys) {
      const [source, category] = key.split(':')
      if (source === activeWorkspace) {
        storageService.restoreDeprecatedCategory(source, category)
      }
    }
    setCatKeys(storageService.getDeprecatedCategories())
    window.dispatchEvent(new Event('storage'))
    useDocumentStore.getState().applyFilters()
  }

  const goDoc = (docId: string) => {
    sessionStorage.setItem('hiddendocs-scroll', String(window.scrollY))
    navigate(`/doc/${docId}`, { state: { from: '/hidden-docs' } })
  }

  useEffect(() => {
    const saved = sessionStorage.getItem('hiddendocs-scroll')
    if (saved) {
      const timer = setTimeout(() => {
        window.scrollTo(0, Number(saved))
        sessionStorage.removeItem('hiddendocs-scroll')
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [location])

  const hasContent = items.length > 0 || hiddenCategories.length > 0

  return (
    <div className="cs-settings">
      <div className="cs-settings-header">
        <div className="cs-section-label">HIDDEN</div>
        <h1>Hidden Documents</h1>
        <p className="cs-settings-subtitle">
          Hidden items are excluded from browsing but still count in statistics.
        </p>
      </div>

      {/* Hidden Categories */}
      <div className="cs-card">
        <div className="cs-card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Folder size={16} />
            HIDDEN CATEGORIES
            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 'normal' }}>
              {hiddenCategories.length}
            </span>
          </div>
          {hiddenCategories.length > 0 && (
            <button className="cs-btn cs-btn-ghost" style={{ fontSize: '0.75rem' }} onClick={handleRestoreAllCategories}>
              Restore All
            </button>
          )}
        </div>
        <div className="cs-card-body">
          {hiddenCategories.length === 0 ? (
            <div className="cs-empty-hint" style={{ padding: '0.75rem 0' }}>
              No hidden categories.
            </div>
          ) : (
            <div className="cs-item-list">
              {hiddenCategories.map(item => (
                <div key={item.key} className="cs-model-item">
                  <div className="cs-model-info">
                    <div className="cs-model-name">
                      {item.catInfo?.label || item.category}
                      <span className="cs-badge">{item.docCount} docs</span>
                    </div>
                  </div>
                  <button
                    className="cs-btn cs-btn-ghost"
                    onClick={e => handleRestoreCategory(item.key, e)}
                    title="Restore"
                  >
                    <Undo2 size={14} />
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Hidden Documents */}
      <div className="cs-card">
        <div className="cs-card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <EyeOff size={16} />
            HIDDEN DOCS
            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 'normal' }}>
              {items.length} docs
            </span>
          </div>
          {items.length > 0 && (
            <button className="cs-btn cs-btn-ghost" style={{ fontSize: '0.75rem' }} onClick={handleRestoreAllDocs}>
              Restore All
            </button>
          )}
        </div>
        <div className="cs-card-body">
          {hasContent && (
            <div className="cs-search-wrap">
              <Search size={14} />
              <input
                type="search"
                className="cs-search-input"
                placeholder="Search hidden documents..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          )}

          {ids.length === 0 ? (
            <div className="cs-empty-hint">
              <EyeOff size={32} style={{ opacity: 0.3, marginBottom: '0.5rem', display: 'block' }} />
              No hidden documents.
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
                    </div>
                  </div>
                  <button
                    className="cs-btn cs-btn-ghost"
                    onClick={e => handleRestore(item.docId, e)}
                    title="Restore"
                  >
                    <Undo2 size={14} />
                    Restore
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

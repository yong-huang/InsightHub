import { useState, useRef } from 'react'
import { Link2, X, Loader, CheckCircle, AlertCircle } from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDynamicCategories } from '@/hooks/useDynamicCategories'

interface UrlImportDialogProps {
  onClose: () => void
  onImported?: (docId: string) => void
}

export function UrlImportDialog({ onClose, onImported }: UrlImportDialogProps) {
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const categories = useDynamicCategories(activeWorkspace)
  const reloadDocuments = useDocumentStore(s => s.reloadDocuments)

  const [url, setUrl] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(categories[0]?.key || (categories.length === 0 ? '__custom__' : ''))
  const [customCategory, setCustomCategory] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [importedId, setImportedId] = useState<string | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const handleImport = async () => {
    setError('')
    if (!url.trim()) {
      setError('Please enter a URL')
      return
    }
    const category = selectedCategory === '__custom__'
      ? customCategory.trim()
      : selectedCategory === '__root__'
        ? ''
        : selectedCategory
    if (!category && selectedCategory !== '__root__') {
      setError('Please select or enter a category')
      return
    }

    // Single step: server fetches URL, extracts metadata, saves record
    setImporting(true)
    try {
      const res = await fetch('/api/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), source: activeWorkspace, category }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to import URL')
        setImporting(false)
        return
      }
      setImportedId(data.id)
      await reloadDocuments()
      onImported?.(data.id)
    } catch {
      setError('Network error while importing URL')
    } finally {
      setImporting(false)
    }
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current && !importing) {
      onClose()
    }
  }

  const busy = importing

  return (
    <div className="import-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="import-dialog">
        <div className="import-dialog-header">
          <h3>Import from URL</h3>
          {!busy && !importedId && (
            <button className="import-dialog-close" onClick={onClose}>
              <X size={16} />
            </button>
          )}
        </div>

        {!importedId ? (
          <>
            <div className="import-category-select">
              <label>URL</label>
              <input
                type="url"
                className="filter-select"
                placeholder="https://example.com/article"
                value={url}
                onChange={e => setUrl(e.target.value)}
                disabled={busy}
                onKeyDown={e => { if (e.key === 'Enter' && !busy) handleImport() }}
                autoFocus
              />
            </div>

            <div className="import-category-select">
              <label>Category</label>
              <select
                className="filter-select"
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                disabled={busy}
              >
                {categories.map(cat => (
                  <option key={cat.key} value={cat.key}>{cat.label}</option>
                ))}
                <option value="__root__">(Root — no subdirectory)</option>
                <option value="__custom__">+ New Category...</option>
              </select>
              {selectedCategory === '__custom__' && (
                <input
                  type="text"
                  className="filter-select"
                  style={{ marginTop: 4 }}
                  placeholder="Enter category name"
                  value={customCategory}
                  onChange={e => setCustomCategory(e.target.value)}
                  disabled={busy}
                />
              )}
            </div>

            {busy && (
              <div className="import-progress">
                <span className="import-progress-text">
                  Importing...
                </span>
              </div>
            )}

            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', color: 'var(--error)' }}>
                <AlertCircle size={16} />
                <span style={{ fontSize: 13 }}>{error}</span>
              </div>
            )}

            {!busy && (
              <div className="import-dialog-actions">
                <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                <button className="btn btn-primary" onClick={handleImport}>
                  {importing ? <Loader size={14} className="spin" /> : <Link2 size={14} />}
                  Import
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 0' }}>
              <CheckCircle size={20} style={{ color: 'var(--success)' }} />
              <span>Article imported successfully!</span>
            </div>
            <div className="import-dialog-actions">
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

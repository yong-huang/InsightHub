import { useState, useRef } from 'react'
import { Upload, FileText, X, CheckCircle, AlertCircle } from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDynamicCategories } from '@/hooks/useDynamicCategories'

interface ImportDialogProps {
  files: File[]
  onClose: () => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ImportDialog({ files, onClose }: ImportDialogProps) {
  const importDoc = useDocumentStore(s => s.importDocument)
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const categories = useDynamicCategories(activeWorkspace)
  const [selectedCategory, setSelectedCategory] = useState(categories[0]?.key || (categories.length === 0 ? '__custom__' : ''))
  const [customCategory, setCustomCategory] = useState('')
  const [importing, setImporting] = useState(false)
  const [current, setCurrent] = useState(0)
  const [results, setResults] = useState<{ file: string; ok: boolean; error?: string }[]>([])
  const [done, setDone] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  const handleImport = async () => {
    setImporting(true)
    setCurrent(0)
    setResults([])
    const importResults: typeof results = []

    for (let i = 0; i < files.length; i++) {
      setCurrent(i + 1)
      try {
        const category = selectedCategory === '__custom__'
          ? customCategory.trim()
          : selectedCategory === '__root__'
            ? ''
            : selectedCategory
    await importDoc(files[i], activeWorkspace, category)
        importResults.push({ file: files[i].name, ok: true })
      } catch (e) {
        importResults.push({ file: files[i].name, ok: false, error: e instanceof Error ? e.message : 'Unknown error' })
      }
    }

    setResults(importResults)
    setImporting(false)
    setDone(true)
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current && !importing) {
      onClose()
    }
  }

  return (
    <div className="import-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="import-dialog">
        {!done ? (
          <>
            <div className="import-dialog-header">
              <h3>Import Document</h3>
              {!importing && (
                <button className="import-dialog-close" onClick={onClose}>
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="import-file-list">
              {files.map((file, i) => (
                <div key={i} className="import-file-item">
                  <FileText size={16} />
                  <span className="import-file-name">{file.name}</span>
                  <span className="import-file-size">{formatFileSize(file.size)}</span>
                </div>
              ))}
            </div>

            <div className="import-category-select">
              <label>Category</label>
              <select
                className="filter-select"
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                disabled={importing}
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
                  disabled={importing}
                />
              )}
            </div>

            {importing && (
              <div className="import-progress">
                <span className="import-progress-text">
                  Importing {current}/{files.length}...
                </span>
              </div>
            )}

            {!importing && (
              <div className="import-dialog-actions">
                <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                <button className="btn btn-primary" onClick={handleImport}>
                  <Upload size={14} />
                  Import {files.length} files
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="import-dialog-header">
              <h3>Import Complete</h3>
            </div>
            <div className="import-file-list">
              {results.map((r, i) => (
                <div key={i} className={`import-file-item ${r.ok ? 'success' : 'error'}`}>
                  {r.ok ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                  <span className="import-file-name">{r.file}</span>
                  <span className="import-file-status">
                    {r.ok ? 'Success' : r.error || 'Failed'}
                  </span>
                </div>
              ))}
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

import { useState, useRef } from 'react'
import { Upload, FileText, X, CheckCircle, AlertCircle } from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import { getCategoriesBySource } from '@/utils/categoryMap'

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
  const categories = getCategoriesBySource('techinsight')
  const [selectedCategory, setSelectedCategory] = useState(categories[0]?.key || '')
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
        await importDoc(files[i], 'techinsight', selectedCategory)
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
              <h3>导入文档</h3>
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
              <label>分类</label>
              <select
                className="filter-select"
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                disabled={importing}
              >
                {categories.map(cat => (
                  <option key={cat.key} value={cat.key}>{cat.label}</option>
                ))}
              </select>
            </div>

            {importing && (
              <div className="import-progress">
                <span className="import-progress-text">
                  正在导入 {current}/{files.length}...
                </span>
              </div>
            )}

            {!importing && (
              <div className="import-dialog-actions">
                <button className="btn btn-secondary" onClick={onClose}>取消</button>
                <button className="btn btn-primary" onClick={handleImport}>
                  <Upload size={14} />
                  导入 {files.length} 个文件
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="import-dialog-header">
              <h3>导入完成</h3>
            </div>
            <div className="import-file-list">
              {results.map((r, i) => (
                <div key={i} className={`import-file-item ${r.ok ? 'success' : 'error'}`}>
                  {r.ok ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                  <span className="import-file-name">{r.file}</span>
                  <span className="import-file-status">
                    {r.ok ? '成功' : r.error || '失败'}
                  </span>
                </div>
              ))}
            </div>
            <div className="import-dialog-actions">
              <button className="btn btn-primary" onClick={onClose}>完成</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

import { useState, useRef } from 'react'
import { Upload, FileText, X, CheckCircle, AlertCircle, Lock } from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
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
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const importDoc = useDocumentStore(s => s.importDocument)
  const categories = getCategoriesBySource(activeWorkspace)
  const [selectedCategory, setSelectedCategory] = useState(categories[0]?.key || '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [importing, setImporting] = useState(false)
  const [current, setCurrent] = useState(0)
  const [results, setResults] = useState<{ file: string; ok: boolean; error?: string }[]>([])
  const [done, setDone] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  const useEncryption = password.length > 0

  const handleImport = async () => {
    if (useEncryption && password !== confirmPassword) return
    setImporting(true)
    setCurrent(0)
    setResults([])
    const importResults: typeof results = []

    for (let i = 0; i < files.length; i++) {
      setCurrent(i + 1)
      try {
        await importDoc(files[i], activeWorkspace, selectedCategory, useEncryption ? password : undefined)
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

            <div className="import-encryption-section">
              <label>
                <Lock size={14} />
                加密存储
              </label>
              <p className="import-encryption-hint">设置密码后，文件将以 AES-256 加密存储，阅读时需要输入密码</p>
              <input
                type="password"
                placeholder="密码（留空则不加密）"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={importing}
              />
              {useEncryption && (
                <input
                  type="password"
                  placeholder="确认密码"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  disabled={importing}
                  style={{
                    borderColor: confirmPassword && password !== confirmPassword
                      ? 'var(--accent-red)'
                      : undefined,
                  }}
                />
              )}
              {useEncryption && confirmPassword && password !== confirmPassword && (
                <span style={{ fontSize: '0.75rem', color: 'var(--accent-red)' }}>
                  两次输入的密码不一致
                </span>
              )}
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
                <button
                  className="btn btn-primary"
                  onClick={handleImport}
                  disabled={useEncryption && password !== confirmPassword}
                >
                  <Upload size={14} />
                  {useEncryption ? '加密导入' : '导入'} {files.length} 个文件
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

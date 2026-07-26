import { useState, useRef } from 'react'
import { X, Loader, ArrowRightLeft, AlertCircle } from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDynamicCategories } from '@/hooks/useDynamicCategories'
import { moveWorkspaceCategory } from '@/services/importService'
import { storageService } from '@/services/storageService'

interface MoveCategoryDialogProps {
  workspaceId: string
  category: string
  docCount: number
  onClose: () => void
}

export function MoveCategoryDialog({ workspaceId, category, docCount, onClose }: MoveCategoryDialogProps) {
  const workspaces = usePreferenceStore(s => s.workspaces)
  const reloadDocuments = useDocumentStore(s => s.reloadDocuments)

  const allWorkspaces = workspaces
  const [targetWorkspaceId, setTargetWorkspaceId] = useState(workspaceId)
  const targetCategories = useDynamicCategories(targetWorkspaceId)
  const [targetCategory, setTargetCategory] = useState('__root__')
  const [customCategory, setCustomCategory] = useState('')
  const [moving, setMoving] = useState(false)
  const [error, setError] = useState('')
  const overlayRef = useRef<HTMLDivElement>(null)

  const currentWsLabel = workspaces.find(ws => ws.id === workspaceId)?.label || workspaceId

  const resolvedTargetCategory = targetCategory === '__root__' ? category : (targetCategory === '__custom__' ? customCategory.trim() : targetCategory)
  const isSameLocation = targetWorkspaceId === workspaceId && resolvedTargetCategory === category

  const handleMove = async () => {
    setError('')
    const resolvedCategory = targetCategory === '__root__' ? category : (targetCategory === '__custom__' ? customCategory.trim() : targetCategory)
    if (!targetWorkspaceId) {
      setError('Please select a target workspace')
      return
    }
    if (targetCategory === '__custom__' && !resolvedCategory) {
      setError('Please enter a category name')
      return
    }

    setMoving(true)
    try {
      const { mappings } = await moveWorkspaceCategory(workspaceId, category, targetWorkspaceId, resolvedCategory)
      // Migrate all document IDs in localStorage
      for (const [oldId, newId] of Object.entries(mappings)) {
        storageService.migrateDocumentId(oldId, newId)
      }
      await reloadDocuments()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Move failed')
    } finally {
      setMoving(false)
    }
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current && !moving) {
      onClose()
    }
  }

  return (
    <div className="import-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="import-dialog">
        <div className="import-dialog-header">
          <h3>Move Category</h3>
          {!moving && (
            <button className="import-dialog-close" onClick={onClose}>
              <X size={16} />
            </button>
          )}
        </div>

        <div className="import-category-select">
          <label>From</label>
          <div className="filter-select" style={{ opacity: 0.7, cursor: 'default' }}>
            {currentWsLabel} / {category} ({docCount} documents)
          </div>
        </div>

        <div className="import-category-select">
          <label>Target Workspace</label>
          <select
            className="filter-select"
            value={targetWorkspaceId}
            onChange={e => {
              setTargetWorkspaceId(e.target.value)
              setTargetCategory('__root__')
              setCustomCategory('')
            }}
            disabled={moving}
          >
            {allWorkspaces.map(ws => (
              <option key={ws.id} value={ws.id}>{ws.id === workspaceId ? `${ws.label} (current)` : ws.label}</option>
            ))}
          </select>
        </div>

        <div className="import-category-select">
          <label>Target Category</label>
          <select
            className="filter-select"
            value={targetCategory}
            onChange={e => setTargetCategory(e.target.value)}
            disabled={moving}
          >
            {targetWorkspaceId === workspaceId && (
              <option value="__root__">(Root — no subcategory)</option>
            )}
            {targetCategories
              .filter(cat => !(targetWorkspaceId === workspaceId && cat.key === category))
              .map(cat => (
                <option key={cat.key} value={cat.key}>{cat.label}</option>
              ))}
            <option value="__custom__">+ New Category...</option>
          </select>
          {targetCategory === '__custom__' && (
            <input
              type="text"
              className="filter-select"
              style={{ marginTop: 4 }}
              placeholder="Enter category name"
              value={customCategory}
              onChange={e => setCustomCategory(e.target.value)}
              disabled={moving}
              autoFocus
            />
          )}
        </div>

        {moving && (
          <div className="import-progress">
            <span className="import-progress-text">Moving category...</span>
          </div>
        )}

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', color: 'var(--error)' }}>
            <AlertCircle size={16} />
            <span style={{ fontSize: 13 }}>{error}</span>
          </div>
        )}

        {!moving && (
          <div className="import-dialog-actions">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleMove} disabled={isSameLocation}>
              <ArrowRightLeft size={14} />
              Move
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

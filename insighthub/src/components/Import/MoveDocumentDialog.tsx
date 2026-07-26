import { useState, useRef } from 'react'
import { X, Loader, ArrowRightLeft, AlertCircle } from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDynamicCategories } from '@/hooks/useDynamicCategories'
import { moveDocumentToWorkspace } from '@/services/importService'
import { storageService } from '@/services/storageService'
import { getShortLabel } from '@/utils/workspaceUtils'
import type { Document } from '@/types'

interface MoveDocumentDialogProps {
  doc: Document
  onClose: () => void
  onMoved?: (newId: string) => void
}

export function MoveDocumentDialog({ doc, onClose, onMoved }: MoveDocumentDialogProps) {
  const workspaces = usePreferenceStore(s => s.workspaces)
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const reloadDocuments = useDocumentStore(s => s.reloadDocuments)

  const allWorkspaces = workspaces
  const [targetWorkspaceId, setTargetWorkspaceId] = useState(doc.source)
  const targetCategories = useDynamicCategories(targetWorkspaceId)
  const [targetCategory, setTargetCategory] = useState(targetCategories[0]?.key || '')
  const [customCategory, setCustomCategory] = useState('')
  const [moving, setMoving] = useState(false)
  const [error, setError] = useState('')
  const overlayRef = useRef<HTMLDivElement>(null)

  const currentWsLabel = workspaces.find(ws => ws.id === doc.source)?.label || doc.source
  const targetWsLabel = workspaces.find(ws => ws.id === targetWorkspaceId)?.label || targetWorkspaceId

  // Disable move button when source and target are the same
  const isSameCategory = targetWorkspaceId === doc.source && (targetCategory === '__custom__' ? customCategory.trim() === doc.category : targetCategory === doc.category)
  const isSameLocation = targetWorkspaceId === doc.source && isSameCategory

  const handleMove = async () => {
    setError('')
    const category = targetCategory === '__custom__' ? customCategory.trim() : targetCategory
    if (!targetWorkspaceId) {
      setError('Please select a target workspace')
      return
    }
    if (!category && targetCategory !== '') {
      setError('Please select or enter a category')
      return
    }

    setMoving(true)
    try {
      const { newId } = await moveDocumentToWorkspace(doc.id, targetWorkspaceId, category)
      storageService.migrateDocumentId(doc.id, newId)
      await reloadDocuments()
      onMoved?.(newId)
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
          <h3>Move Document</h3>
          {!moving && (
            <button className="import-dialog-close" onClick={onClose}>
              <X size={16} />
            </button>
          )}
        </div>

        <div className="import-category-select">
          <label>From</label>
          <div className="filter-select" style={{ opacity: 0.7, cursor: 'default' }}>
            {currentWsLabel} / {doc.category}
          </div>
        </div>

        <div className="import-category-select">
          <label>Target Workspace</label>
          <select
            className="filter-select"
            value={targetWorkspaceId}
            onChange={e => {
              setTargetWorkspaceId(e.target.value)
              setTargetCategory('')
              setCustomCategory('')
            }}
            disabled={moving}
          >
            {allWorkspaces.map(ws => (
              <option key={ws.id} value={ws.id}>{ws.id === doc.source ? `${ws.label} (current)` : ws.label}</option>
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
            {targetCategories
              .filter(cat => !(targetWorkspaceId === doc.source && cat.key === doc.category))
              .map(cat => (
                <option key={cat.key} value={cat.key}>{cat.label}</option>
              ))}
            {targetWorkspaceId === doc.source && (
              <option value="">(Root — no subdirectory)</option>
            )}
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
            <span className="import-progress-text">Moving document...</span>
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
              {moving ? <Loader size={14} className="spin" /> : <ArrowRightLeft size={14} />}
              Move
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

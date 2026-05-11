import { useCallback, memo } from 'react'
import {
  ChevronRight,
  ChevronDown,
} from 'lucide-react'

export interface TreeNodeProps {
  nodeId: string
  label: string
  icon: React.ReactNode
  color: string
  count?: React.ReactNode
  children?: React.ReactNode
  onClick?: () => void
  tooltip?: string
  openNodes: Set<string>
  onToggle: (id: string) => void
}

export const TreeNode = memo(function TreeNode({ nodeId, label, icon, color, count, children, onClick, tooltip, openNodes, onToggle }: TreeNodeProps) {
  const open = openNodes.has(nodeId)
  const hasChildren = Boolean(children)
  const toggle = useCallback((e: React.MouseEvent) => { e.stopPropagation(); onToggle(nodeId) }, [nodeId, onToggle])

  return (
    <div className="kt-group">
      <div className={`kt-node ${onClick ? 'kt-clickable' : ''}`} onClick={onClick ?? (hasChildren ? toggle : undefined)}>
        <span className="kt-toggle" onClick={hasChildren ? toggle : undefined}>
          {hasChildren ? (
            open ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span style={{ width: 14, display: 'inline-block' }} />
          )}
        </span>
        <span className="kt-icon" style={{ color }}>{icon}</span>
        <span className="kt-label" title={tooltip}>{label}</span>
        {count !== undefined && <span className="kt-count">{count}</span>}
      </div>
      {hasChildren && open && <div className="kt-children">{children}</div>}
    </div>
  )
})

import { HIGHLIGHT_COLORS } from '@/types'
import { MessageSquare } from 'lucide-react'
import type { SelectionInfo } from '@/hooks/useAnnotationIframe'

interface AnnotationBarProps {
  selectionInfo: SelectionInfo
  onHighlight: (color: string) => void
  onComment: () => void
  onClose: () => void
}

export function AnnotationBar({ selectionInfo, onHighlight, onComment, onClose }: AnnotationBarProps) {
  const rect = selectionInfo.rect

  // Position: above the selection, centered
  const top = rect.top + window.scrollY - 48
  const left = rect.left + rect.width / 2 + window.scrollX

  return (
    <>
      {/* Backdrop to close on outside click */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9998,
        }}
        onMouseDown={onClose}
      />
      <div
        className="annotation-bar"
        style={{ top, left }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="annotation-bar-arrow" />
        <div className="annotation-bar-colors">
          {HIGHLIGHT_COLORS.map(color => (
            <button
              key={color}
              className="annotation-color-btn"
              style={{ backgroundColor: color }}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onHighlight(color) }}
              title="高亮"
            />
          ))}
        </div>
        <div className="annotation-bar-divider" />
        <button
          className="annotation-bar-comment-btn"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onComment() }}
          title="添加批注"
        >
          <MessageSquare size={14} />
          <span>批注</span>
        </button>
      </div>
    </>
  )
}

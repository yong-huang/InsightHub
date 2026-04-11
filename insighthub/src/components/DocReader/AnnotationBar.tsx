import { useEffect, useRef } from 'react'
import { HIGHLIGHT_COLORS } from '@/types'
import { MessageSquare, Eraser, Lightbulb, Languages, MessageCircle } from 'lucide-react'
import type { SelectionInfo } from '@/hooks/useAnnotationIframe'

interface AnnotationBarProps {
  selectionInfo: SelectionInfo
  onHighlight: (color: string) => void
  onComment: () => void
  onExplain: () => void
  onTranslate: () => void
  onAskAI: () => void
  onRemoveHighlights: (annotationIds: string[]) => void
  onClose: () => void
}

export function AnnotationBar({ selectionInfo, onHighlight, onComment, onExplain, onTranslate, onAskAI, onRemoveHighlights, onClose }: AnnotationBarProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const rect = selectionInfo.rect
  const hasExisting = selectionInfo.existingAnnotationIds.length > 0

  // Position: above the selection, centered
  const top = rect.top + window.scrollY - 48
  const left = rect.left + rect.width / 2 + window.scrollX

  // Close on mousedown outside the bar or on scroll
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleWheel = () => onClose()
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('wheel', handleWheel, { passive: true })
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('wheel', handleWheel)
    }
  }, [onClose])

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onRemoveHighlights(selectionInfo.existingAnnotationIds)
  }

  return (
    <div
      ref={barRef}
      className="annotation-bar"
      style={{ top, left, pointerEvents: 'none' }}
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
      </button>
      <div className="annotation-bar-divider" />
      <button
        className="annotation-bar-comment-btn"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onExplain() }}
        title="AI 解释"
      >
        <Lightbulb size={14} />
      </button>
      <button
        className="annotation-bar-comment-btn"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onTranslate() }}
        title="AI 翻译"
      >
        <Languages size={14} />
      </button>
      <button
        className="annotation-bar-comment-btn"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onAskAI() }}
        title="AI 提问"
      >
        <MessageCircle size={14} />
      </button>
      {hasExisting && (
        <>
          <div className="annotation-bar-divider" />
          <button
            className="annotation-bar-comment-btn annotation-bar-remove-btn"
            onMouseDown={handleRemove}
            title="取消高亮"
          >
            <Eraser size={14} />
          </button>
        </>
      )}
    </div>
  )
}

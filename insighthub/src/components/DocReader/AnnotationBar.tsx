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

/** Stop propagation and prevent default for pointer events */
const stopAndPrevent = (e: React.PointerEvent) => {
  e.preventDefault()
  e.stopPropagation()
}

export function AnnotationBar({ selectionInfo, onHighlight, onComment, onExplain, onTranslate, onAskAI, onRemoveHighlights, onClose }: AnnotationBarProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const rect = selectionInfo.rect
  const hasExisting = selectionInfo.existingAnnotationIds.length > 0

  // Position: above the selection, centered
  const top = rect.top + window.scrollY - 48
  const left = rect.left + rect.width / 2 + window.scrollX

  // Close on pointerdown outside the bar or on scroll
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleWheel = () => onClose()
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('wheel', handleWheel, { passive: true })
    document.addEventListener('touchstart', handlePointerDown, { passive: true })
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('wheel', handleWheel)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [onClose])

  const handleRemove = (e: React.PointerEvent) => {
    stopAndPrevent(e)
    onRemoveHighlights(selectionInfo.existingAnnotationIds)
  }

  return (
    <div
      ref={barRef}
      className="annotation-bar"
      style={{ top, left, pointerEvents: 'auto' }}
    >
      <div className="annotation-bar-arrow" />
      <div className="annotation-bar-colors">
        {HIGHLIGHT_COLORS.map(color => (
          <button
            key={color}
            className="annotation-color-btn"
            style={{ backgroundColor: color }}
            onPointerDown={(e) => { stopAndPrevent(e); onHighlight(color) }}
            title="Highlight"
          />
        ))}
      </div>
      <div className="annotation-bar-divider" />
      <button
        className="annotation-bar-comment-btn"
        onPointerDown={(e) => { stopAndPrevent(e); onComment() }}
        title="Add Comment"
      >
        <MessageSquare size={14} />
      </button>
      <div className="annotation-bar-divider" />
      <button
        className="annotation-bar-comment-btn"
        onPointerDown={(e) => { stopAndPrevent(e); onExplain() }}
        title="AI Explain"
      >
        <Lightbulb size={14} />
      </button>
      <button
        className="annotation-bar-comment-btn"
        onPointerDown={(e) => { stopAndPrevent(e); onTranslate() }}
        title="AI Translate"
      >
        <Languages size={14} />
      </button>
      <button
        className="annotation-bar-comment-btn"
        onPointerDown={(e) => { stopAndPrevent(e); onAskAI() }}
        title="AI Ask"
      >
        <MessageCircle size={14} />
      </button>
      {hasExisting && (
        <>
          <div className="annotation-bar-divider" />
          <button
            className="annotation-bar-comment-btn annotation-bar-remove-btn"
            onPointerDown={handleRemove}
            title="Remove Highlight"
          >
            <Eraser size={14} />
          </button>
        </>
      )}
    </div>
  )
}

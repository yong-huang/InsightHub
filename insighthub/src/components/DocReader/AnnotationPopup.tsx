import { useEffect, useRef } from 'react'
import type { Annotation } from '@/types'
import { MessageSquare, X, Trash2 } from 'lucide-react'

interface AnnotationPopupProps {
  annotation: Annotation
  rect: DOMRect
  onClose: () => void
  onRemove: (id: string) => void
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function AnnotationPopup({ annotation: ann, rect, onClose, onRemove }: AnnotationPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null)

  // Position: below the mark, left-aligned
  const top = rect.bottom + window.scrollY + 8
  const left = rect.left + window.scrollX

  // Close on mousedown outside or on scroll
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
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

  return (
    <div
      ref={popupRef}
      className="annotation-popup"
      style={{ top, left }}
    >
      <button className="annotation-popup-close" onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onClose() }}>
        <X size={12} />
      </button>

      <div className="annotation-popup-text">
        {ann.text.length > 120 ? ann.text.slice(0, 120) + '...' : ann.text}
      </div>

      {ann.comment && (
        <div className="annotation-popup-comment">
          <MessageSquare size={12} />
          <span>{ann.comment}</span>
        </div>
      )}

      {ann.replies && ann.replies.length > 0 && (
        <div className="annotation-popup-replies">
          {ann.replies.slice().sort((a, b) => a.createdAt - b.createdAt).map(reply => (
            <div key={reply.id} className="annotation-popup-reply">
              <span>{reply.text}</span>
            </div>
          ))}
        </div>
      )}

      <div className="annotation-popup-footer">
        <span className="annotation-popup-time">{formatTime(ann.createdAt)}</span>
        <button
          className="annotation-popup-delete"
          onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onRemove(ann.id) }}
        >
          <Trash2 size={12} /> 删除
        </button>
      </div>
    </div>
  )
}

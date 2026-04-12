import { useEffect, useRef, type ReactNode } from 'react'
import { X, Loader2 } from 'lucide-react'
import { renderMarkdown } from '@/utils/markdownRenderer'

interface AIBubbleProps {
  rect: DOMRect
  title: string
  icon: ReactNode
  streamingText: string | null
  isStreaming: boolean
  error: string | null
  onClose: () => void
}

export function AIBubble({ rect, title, icon, streamingText, isStreaming, error, onClose }: AIBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Position below the selection
  const top = rect.bottom + window.scrollY + 8
  const left = rect.left + rect.width / 2 + window.scrollX

  // Close on outside click or scroll
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (bubbleRef.current && !bubbleRef.current.contains(e.target as Node)) {
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

  // Auto-scroll body during streaming
  useEffect(() => {
    if (isStreaming && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [streamingText, isStreaming])

  return (
    <div
      ref={bubbleRef}
      className="ai-bubble"
      style={{ top, left }}
    >
      <div className="ai-bubble-header">
        <span className="ai-bubble-icon">{icon}</span>
        <span className="ai-bubble-title">{title}</span>
        {isStreaming && <Loader2 size={12} className="spin" />}
        <button className="ai-bubble-close" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <div className="ai-bubble-body" ref={bodyRef}>
        {error && (
          <div className="ai-bubble-error">{error}</div>
        )}
        {streamingText && (
          <div
            className="ai-bubble-content"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingText) }}
          />
        )}
        {isStreaming && (
          <span className="ai-bubble-cursor" />
        )}
      </div>
    </div>
  )
}

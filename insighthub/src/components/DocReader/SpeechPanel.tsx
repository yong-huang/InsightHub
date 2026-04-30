import { useEffect, useRef } from 'react'
import { Languages, RefreshCw, X, Loader2, Maximize, Minimize } from 'lucide-react'
import { renderMarkdown } from '@/utils/markdownRenderer'

interface SpeechPanelProps {
  scriptText: string | null
  isGenerating: boolean
  error: string | null
  onGenerate: () => void
  onClose: () => void
  poppedOut?: boolean
  onTogglePopup?: () => void
}

export function SpeechPanel({ scriptText, isGenerating, error, onGenerate, onClose, poppedOut, onTogglePopup }: SpeechPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isGenerating && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [scriptText, isGenerating])

  const panelContent = (
    <>
      <div className="summary-panel-header">
        <h3>Presentation Script</h3>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button className="summary-panel-close" onClick={onTogglePopup} title={poppedOut ? 'Minimize' : 'Expand'}>
            {poppedOut ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
          <button className="summary-panel-close" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      {isGenerating && (
        <div className="summary-panel-progress">
          <Loader2 size={14} className="spin" />
          <span>Writing script...</span>
        </div>
      )}

      <div className="summary-panel-body" ref={scrollRef}>
        {!scriptText && !isGenerating && !error && (
          <div className="summary-panel-empty">
            <Languages size={32} />
            <p>Presentation Script</p>
            <p className="summary-panel-empty-hint">Generate a conversational script based on the document content, ready for speaking or presenting</p>
            <button className="btn btn-primary btn-sm" onClick={onGenerate}>
              Generate Script
            </button>
          </div>
        )}

        {error && (
          <div className="summary-panel-error">
            <p>{error}</p>
            <button className="btn btn-secondary btn-sm" onClick={onGenerate}>
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        )}

        {isGenerating && scriptText && (
          <div className="summary-panel-text summary-panel-streaming"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(scriptText) }}
          />
        )}

        {!isGenerating && scriptText && !error && (
          <div className="summary-panel-text summary-panel-rendered"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(scriptText) }}
          />
        )}
      </div>

      {!isGenerating && scriptText && !error && (
        <div className="summary-panel-footer">
          <button className="btn btn-secondary btn-sm" onClick={onGenerate}>
            <RefreshCw size={14} /> Regenerate
          </button>
        </div>
      )}
    </>
  )

  if (poppedOut) {
    return (
      <div className="summary-panel-overlay" onClick={(e) => { if (e.target === e.currentTarget) onTogglePopup?.() }}>
        <div className="summary-panel-popup">
          <div className="summary-panel">
            {panelContent}
          </div>
        </div>
      </div>
    )
  }

  return <div className="summary-panel">{panelContent}</div>
}

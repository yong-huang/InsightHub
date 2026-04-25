import { useEffect, useRef } from 'react'
import { FileText, RefreshCw, X, Loader2 } from 'lucide-react'
import { renderMarkdown } from '@/utils/markdownRenderer'

interface SummaryPanelProps {
  summaryText: string | null
  isGenerating: boolean
  error: string | null
  onGenerate: () => void
  onClose: () => void
}

export function SummaryPanel({ summaryText, isGenerating, error, onGenerate, onClose }: SummaryPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom during generation
  useEffect(() => {
    if (isGenerating && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [summaryText, isGenerating])

  return (
    <div className="summary-panel">
      <div className="summary-panel-header">
        <h3>AI Summary</h3>
        <button className="summary-panel-close" onClick={onClose} title="Close">
          <X size={16} />
        </button>
      </div>

      {isGenerating && (
        <div className="summary-panel-progress">
          <Loader2 size={14} className="spin" />
          <span>Generating summary...</span>
        </div>
      )}

      <div className="summary-panel-body" ref={scrollRef}>
        {!summaryText && !isGenerating && !error && (
          <div className="summary-panel-empty">
            <FileText size={32} />
            <p>AI Summary</p>
            <p className="summary-panel-empty-hint">Automatically generate a structured summary based on document content</p>
            <button className="btn btn-primary btn-sm" onClick={onGenerate}>
              Generate Summary
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

        {isGenerating && summaryText && (
          <div className="summary-panel-text summary-panel-streaming"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(summaryText) }}
          />
        )}

        {!isGenerating && summaryText && !error && (
          <div className="summary-panel-text summary-panel-rendered"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(summaryText) }}
          />
        )}
      </div>

      {!isGenerating && summaryText && !error && (
        <div className="summary-panel-footer">
          <button className="btn btn-secondary btn-sm" onClick={onGenerate}>
            <RefreshCw size={14} /> Regenerate
          </button>
        </div>
      )}
    </div>
  )
}

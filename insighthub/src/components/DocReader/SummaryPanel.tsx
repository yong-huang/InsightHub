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
        <h3>AI 摘要</h3>
        <button className="summary-panel-close" onClick={onClose} title="关闭">
          <X size={16} />
        </button>
      </div>

      {isGenerating && (
        <div className="summary-panel-progress">
          <Loader2 size={14} className="spin" />
          <span>正在生成摘要...</span>
        </div>
      )}

      <div className="summary-panel-body" ref={scrollRef}>
        {!summaryText && !isGenerating && !error && (
          <div className="summary-panel-empty">
            <FileText size={32} />
            <p>AI 摘要</p>
            <p className="summary-panel-empty-hint">基于文档内容自动生成结构化摘要</p>
            <button className="btn btn-primary btn-sm" onClick={onGenerate}>
              生成摘要
            </button>
          </div>
        )}

        {error && (
          <div className="summary-panel-error">
            <p>{error}</p>
            <button className="btn btn-secondary btn-sm" onClick={onGenerate}>
              <RefreshCw size={14} /> 重试
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
            <RefreshCw size={14} /> 重新生成
          </button>
        </div>
      )}
    </div>
  )
}

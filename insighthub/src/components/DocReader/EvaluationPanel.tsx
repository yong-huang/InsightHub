import { useEffect, useRef } from 'react'
import { ShieldCheck, RefreshCw, X, Loader2 } from 'lucide-react'
import { renderMarkdown } from '@/utils/markdownRenderer'

interface EvaluationPanelProps {
  resultText: string | null
  isGenerating: boolean
  error: string | null
  onGenerate: () => void
  onClose: () => void
}

export function EvaluationPanel({ resultText, isGenerating, error, onGenerate, onClose }: EvaluationPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom during generation
  useEffect(() => {
    if (isGenerating && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [resultText, isGenerating])

  return (
    <div className="summary-panel">
      <div className="summary-panel-header">
        <h3>AI 评估</h3>
        <button className="summary-panel-close" onClick={onClose} title="关闭">
          <X size={16} />
        </button>
      </div>

      {isGenerating && (
        <div className="summary-panel-progress">
          <Loader2 size={14} className="spin" />
          <span>正在评估文档...</span>
        </div>
      )}

      <div className="summary-panel-body" ref={scrollRef}>
        {!resultText && !isGenerating && !error && (
          <div className="summary-panel-empty">
            <ShieldCheck size={32} />
            <p>AI 评估</p>
            <p className="summary-panel-empty-hint">基于文档内容进行准确度评估，指出潜在问题</p>
            <button className="btn btn-primary btn-sm" onClick={onGenerate}>
              开始评估
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

        {isGenerating && resultText && (
          <div className="summary-panel-text summary-panel-streaming"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(resultText) }}
          />
        )}

        {!isGenerating && resultText && !error && (
          <div className="summary-panel-text summary-panel-rendered"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(resultText) }}
          />
        )}
      </div>

      {!isGenerating && resultText && !error && (
        <div className="summary-panel-footer">
          <button className="btn btn-secondary btn-sm" onClick={onGenerate}>
            <RefreshCw size={14} /> 重新评估
          </button>
        </div>
      )}
    </div>
  )
}

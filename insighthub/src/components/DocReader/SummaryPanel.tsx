import { useEffect, useRef } from 'react'
import { FileText, RefreshCw, X, Loader2 } from 'lucide-react'

interface SummaryPanelProps {
  summaryText: string | null
  isGenerating: boolean
  error: string | null
  onGenerate: () => void
  onClose: () => void
}

/** Simple markdown → HTML for ## headers, - lists, **bold** */
function renderMarkdown(text: string): string {
  let html = text
    // ## headers
    .replace(/^## (.+)$/gm, '<h3 class="summary-md-h3">$1</h3>')
    // ### headers
    .replace(/^### (.+)$/gm, '<h4 class="summary-md-h4">$1</h4>')
    // Bold **text**
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // List items - text (indented or not)
    .replace(/^(\s*)[-*] (.+)$/gm, (_, indent, content) => {
      const level = Math.floor(indent.length / 2)
      return `<li class="summary-md-li" style="margin-left:${level * 1.2}rem">${content}</li>`
    })
    // Numbered list
    .replace(/^\d+\. (.+)$/gm, '<li class="summary-md-li">$1</li>')

  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li class="summary-md-li"[^>]*>.*<\/li>\n?)+)/g, '<ul class="summary-md-ul">$1</ul>')

  // Convert remaining newlines to <br> within paragraphs
  html = html.replace(/^(?!<[hulo]|<\/)(.+)$/gm, '<p class="summary-md-p">$1</p>')

  return html
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
          <div className="summary-panel-text summary-panel-streaming">
            {summaryText}
          </div>
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

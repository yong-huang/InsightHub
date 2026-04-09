import { useEffect, useRef } from 'react'
import { FileText, RefreshCw, X, Loader2 } from 'lucide-react'

interface SummaryPanelProps {
  summaryText: string | null
  isGenerating: boolean
  error: string | null
  onGenerate: () => void
  onClose: () => void
}

/** Markdown → HTML for AI summaries: headers, lists, bold, italic, code, blockquotes */
function renderMarkdown(text: string): string {
  // Extract fenced code blocks first to protect them from further processing
  const codeBlocks: string[] = []
  let html = text.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match)
    return `%%CODEBLOCK_${codeBlocks.length - 1}%%`
  })

  // Inline code (before bold/italic to avoid conflicts)
  html = html.replace(/`([^`]+)`/g, '<code class="summary-md-code">$1</code>')

  // # headers
  html = html.replace(/^#### (.+)$/gm, '<h5 class="summary-md-h5">$1</h5>')
  html = html.replace(/^### (.+)$/gm, '<h4 class="summary-md-h4">$1</h4>')
  html = html.replace(/^## (.+)$/gm, '<h3 class="summary-md-h3">$1</h3>')
  html = html.replace(/^# (.+)$/gm, '<h2 class="summary-md-h2">$1</h2>')

  // Bold **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // Italic *text*
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')

  // Blockquotes > text
  html = html.replace(/^>\s?(.+)$/gm, '<blockquote class="summary-md-bq">$1</blockquote>')

  // List items - text (indented or not)
  html = html.replace(/^(\s*)[-*] (.+)$/gm, (_, indent, content) => {
    const level = Math.floor(indent.length / 2)
    return `<li class="summary-md-li" style="margin-left:${level * 1.2}rem">${content}</li>`
  })
  // Numbered list
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="summary-md-li">$1</li>')

  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li class="summary-md-li"[^>]*>.*<\/li>\n?)+)/g, '<ul class="summary-md-ul">$1</ul>')

  // Horizontal rule
  html = html.replace(/^---+$/gm, '<hr class="summary-md-hr">')

  // Convert remaining newlines to <br> within paragraphs
  html = html.replace(/^(?!<[%hulo]|<\/|%%)(.+)$/gm, '<p class="summary-md-p">$1</p>')

  // Restore code blocks
  html = html.replace(/%%CODEBLOCK_(\d+)%%/g, (_, idx) => {
    const block = codeBlocks[parseInt(idx)]
    const content = block.replace(/```\w*\n?/, '').replace(/\n?```$/, '')
    return `<pre class="summary-md-pre"><code>${escapeHtml(content.trim())}</code></pre>`
  })

  return html
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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

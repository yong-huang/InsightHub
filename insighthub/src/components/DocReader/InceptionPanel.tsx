import { useState, useRef, useEffect, useMemo } from 'react'
import { FileText, RefreshCw, X, Loader2, Maximize, Minimize, ChevronRight } from 'lucide-react'
import { renderMarkdown } from '@/utils/markdownRenderer'

const LEVELS = [
  { n: 1, name: 'One-Sentence Summary' },
  { n: 2, name: 'Key Takeaways' },
  { n: 3, name: 'Section Summary' },
  { n: 4, name: 'Detailed Content' },
  { n: 5, name: 'Deep Analysis' },
]

interface InceptionPanelProps {
  inceptionText: string | null
  isGenerating: boolean
  error: string | null
  onGenerate: () => void
  onClose: () => void
  poppedOut?: boolean
  onTogglePopup?: () => void
}

function parseLevels(text: string): Map<number, string> {
  const map = new Map<number, string>()
  // Split by ## Level N heading
  const regex = /^## Level (\d+)/gm
  const indices: { level: number; start: number }[] = []
  let m: RegExpExecArray | null
  while ((m = regex.exec(text)) !== null) {
    indices.push({ level: parseInt(m[1], 10), start: m.index })
  }
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i].start
    const end = i + 1 < indices.length ? indices[i + 1].start : text.length
    const body = text.slice(start, end).replace(/^## Level \d+:?.*?\n/, '')
    map.set(indices[i].level, body.trim())
  }
  return map
}

export function InceptionPanel({ inceptionText, isGenerating, error, onGenerate, onClose, poppedOut, onTogglePopup }: InceptionPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([1]))

  useEffect(() => {
    if (isGenerating && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [inceptionText, isGenerating])

  const levels = useMemo(() => parseLevels(inceptionText || ''), [inceptionText])

  const toggleLevel = (n: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })
  }

  const panelContent = (
    <>
      <div className="summary-panel-header">
        <h3>Inception Summary</h3>
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
          <span>Generating progressive summary...</span>
        </div>
      )}

      <div className="summary-panel-body" ref={scrollRef}>
        {!inceptionText && !isGenerating && !error && (
          <div className="summary-panel-empty">
            <FileText size={32} />
            <p>Inception Summary</p>
            <p className="summary-panel-empty-hint">Generate a 5-level progressive summary, from one sentence to deep analysis</p>
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

        {(inceptionText || isGenerating) && !error && LEVELS.map(({ n, name }) => {
          const content = levels.get(n)
          const isOpen = expanded.has(n)
          return (
            <div key={n} className="inception-level" data-level={n}>
              <div
                className="inception-level-header"
                data-open={isOpen}
                onClick={() => toggleLevel(n)}
              >
                <span className="inception-level-dot" />
                <span className="inception-level-title">L{n}: {name}</span>
                <ChevronRight size={14} className="inception-level-chevron" />
              </div>
              {isOpen && (content || (isGenerating && n === 1 && !content)) && (
                <div className="inception-level-body">
                  {content ? (
                    <div
                      className={isGenerating ? 'summary-panel-streaming' : 'summary-panel-rendered'}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
                    />
                  ) : (
                    <span style={{ color: 'var(--text-dim)' }}>Generating...</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!isGenerating && inceptionText && !error && (
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

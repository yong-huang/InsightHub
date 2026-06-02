import { useEffect, useRef } from 'react'
import { Mic, RefreshCw, X, Loader2, Maximize, Minimize } from 'lucide-react'
import { renderMarkdown } from '@/utils/markdownRenderer'

interface ScriptPanelProps {
  scriptText: string | null
  isGenerating: boolean
  error: string | null
  language: 'zh' | 'en'
  duration: number
  onLanguageChange: (lang: 'zh' | 'en') => void
  onDurationChange: (dur: number) => void
  onGenerate: () => void
  onClose: () => void
  poppedOut?: boolean
  onTogglePopup?: () => void
}

const DURATIONS = [1, 3, 5, 10] as const

export function ScriptPanel({
  scriptText, isGenerating, error,
  language, duration,
  onLanguageChange, onDurationChange,
  onGenerate, onClose, poppedOut, onTogglePopup,
}: ScriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom during generation
  useEffect(() => {
    if (isGenerating && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [scriptText, isGenerating])

  const panelContent = (
    <>
      <div className="summary-panel-header">
        <h3><Mic size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />Presentation Script</h3>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button className="summary-panel-close" onClick={onTogglePopup} title={poppedOut ? 'Minimize' : 'Expand'}>
            {poppedOut ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
          <button className="summary-panel-close" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="script-panel-options">
        <div className="script-panel-option-row">
          <span className="script-panel-option-label">Language</span>
          <div className="cs-btn-group">
            {(['zh', 'en'] as const).map(lang => (
              <button
                key={lang}
                className={`cs-btn ${language === lang ? 'cs-btn-primary' : 'cs-btn-secondary'}`}
                onClick={() => onLanguageChange(lang)}
                disabled={isGenerating}
                style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem' }}
              >
                {lang === 'zh' ? '中文' : 'English'}
              </button>
            ))}
          </div>
        </div>
        <div className="script-panel-option-row">
          <span className="script-panel-option-label">Duration</span>
          <div className="cs-btn-group">
            {DURATIONS.map(d => (
              <button
                key={d}
                className={`cs-btn ${duration === d ? 'cs-btn-primary' : 'cs-btn-secondary'}`}
                onClick={() => onDurationChange(d)}
                disabled={isGenerating}
                style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem' }}
              >
                {d}m
              </button>
            ))}
          </div>
        </div>
      </div>

      {isGenerating && (
        <div className="summary-panel-progress">
          <Loader2 size={14} className="spin" />
          <span>Generating script...</span>
        </div>
      )}

      <div className="summary-panel-body" ref={scrollRef}>
        {!scriptText && !isGenerating && !error && (
          <div className="summary-panel-empty">
            <Mic size={32} />
            <p>Presentation Script</p>
            <p className="summary-panel-empty-hint">Generate a spoken-style presentation script from the document content</p>
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

import { useState, useRef, useCallback, useEffect } from 'react'
import { Eye, Loader2, X, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { analyzeImage, checkVisionConfigured } from '@/services/imageAnalysisService'
import { renderMarkdown } from '@/utils/markdownRenderer'

type AnalysisMode = 'describe' | 'ocr' | 'analyze'

interface ImageAnalysisPanelProps {
  imageSrc: string
  onClose: () => void
}

const MODES: { key: AnalysisMode; label: string }[] = [
  { key: 'describe', label: 'Describe' },
  { key: 'ocr', label: 'Extract Text' },
  { key: 'analyze', label: 'Analyze' },
]

const STORAGE_KEY = 'insighthub:image-analysis'

interface SavedResult {
  text: string
  mode: AnalysisMode
}

function getStorageKey(src: string) {
  // Use the path portion of the URL as key (strip origin/query)
  try { return STORAGE_KEY + ':' + new URL(src, location.origin).pathname } catch { return STORAGE_KEY + ':' + src }
}

export function ImageAnalysisPanel({ imageSrc, onClose }: ImageAnalysisPanelProps) {
  const [mode, setMode] = useState<AnalysisMode>(() => {
    const saved = loadSaved()
    return saved?.mode || 'describe'
  })
  const [resultText, setResultText] = useState<string | null>(() => loadSaved()?.text ?? null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visionConfigured, setVisionConfigured] = useState<boolean | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  function loadSaved(): SavedResult | null {
    try { return JSON.parse(localStorage.getItem(getStorageKey(imageSrc)) || 'null') } catch { return null }
  }

  // Check if vision profile is configured
  useEffect(() => {
    checkVisionConfigured().then(ok => setVisionConfigured(ok))
  }, [])

  // Auto-scroll to bottom during generation
  useEffect(() => {
    if (isGenerating && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [resultText, isGenerating])

  const handleAnalyze = useCallback(async (newMode?: AnalysisMode) => {
    const m = newMode || mode
    if (isGenerating) return
    setResultText(null)
    setError(null)
    setIsGenerating(true)
    abortRef.current = new AbortController()

    try {
      await analyzeImage(imageSrc, m, (text) => setResultText(text), abortRef.current.signal)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message || 'Analysis failed')
      }
    } finally {
      setIsGenerating(false)
      abortRef.current = null
    }
  }, [imageSrc, mode, isGenerating])

  // Persist result to localStorage whenever it changes
  useEffect(() => {
    if (resultText) {
      localStorage.setItem(getStorageKey(imageSrc), JSON.stringify({ text: resultText, mode }))
    }
  }, [resultText, mode, imageSrc])

  const handleModeChange = useCallback((newMode: AnalysisMode) => {
    setMode(newMode)
    setResultText(null)
    setError(null)
  }, [])

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
    setIsGenerating(false)
  }, [])

  return (
    <div className="chat-panel">
      <div className="summary-panel-header">
        <h3><Eye size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} /> AI Vision</h3>
        <button className="summary-panel-close" onClick={onClose} title="Close">
          <X size={16} />
        </button>
      </div>

      <div className="chat-panel-context-mode">
        {MODES.map(m => (
          <button
            key={m.key}
            className={`chat-panel-context-mode-btn${mode === m.key ? ' active' : ''}`}
            onClick={() => handleModeChange(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="summary-panel-body" ref={scrollRef}>
        {!resultText && !isGenerating && !error && (
          <div className="summary-panel-empty">
            <Eye size={32} />
            <p>AI Vision Analysis</p>
            <p className="summary-panel-empty-hint">
              Describe the image, extract text (OCR), or perform detailed analysis
            </p>
            {visionConfigured === false ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                <p style={{ fontSize: '0.8rem', opacity: 0.6, margin: 0 }}>
                  Vision model not configured
                </p>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => navigate('/settings')}
                >
                  <Settings size={14} /> Open Settings
                </button>
              </div>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={() => handleAnalyze()}>
                Analyze Image
              </button>
            )}
          </div>
        )}

        {error && (
          <div className="summary-panel-error">
            <p>{error}</p>
            <button className="btn btn-ghost btn-sm" onClick={() => handleAnalyze()}>
              Retry
            </button>
          </div>
        )}

        {resultText && (
          <div className="summary-panel-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(resultText) }} />
        )}
      </div>

      {(isGenerating || resultText || error) && (
        <div className="summary-panel-footer">
          {isGenerating ? (
            <button className="btn btn-ghost btn-sm" onClick={handleStop}>
              <X size={14} /> Stop
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => handleAnalyze()}>
              <Loader2 size={14} /> Re-analyze
            </button>
          )}
        </div>
      )}
    </div>
  )
}

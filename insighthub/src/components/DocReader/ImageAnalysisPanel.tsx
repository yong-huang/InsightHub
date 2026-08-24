import { useState, useRef, useCallback, useEffect } from 'react'
import { Eye, Loader2, X, Settings, Send, Square } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { analyzeImage, chatAboutImage, checkVisionConfigured } from '@/services/imageAnalysisService'
import { renderMarkdown } from '@/utils/markdownRenderer'

type AnalysisMode = 'describe' | 'ocr' | 'analyze'

interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
}

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
  try { return STORAGE_KEY + ':' + new URL(src, location.origin).pathname } catch { return STORAGE_KEY + ':' + src }
}

export function ImageAnalysisPanel({ imageSrc, onClose }: ImageAnalysisPanelProps) {
  const loadSaved = useCallback((): SavedResult | null => {
    try { return JSON.parse(localStorage.getItem(getStorageKey(imageSrc)) || 'null') } catch { return null }
  }, [imageSrc])
  const [mode, setMode] = useState<AnalysisMode>(() => {
    const saved = loadSaved()
    return saved?.mode || 'describe'
  })
  const [resultText, setResultText] = useState<string | null>(() => loadSaved()?.text ?? null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visionConfigured, setVisionConfigured] = useState<boolean | null>(null)
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isChatStreaming, setIsChatStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState<string | null>(null)
  // Cached image data URL for chat
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [loadingImageUrl, setLoadingImageUrl] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const chatAbortRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const streamingTextRef = useRef('')
  const navigate = useNavigate()

  // Check if vision profile is configured
  useEffect(() => {
    checkVisionConfigured().then(ok => setVisionConfigured(ok))
  }, [])

  // Reset state when image changes
  useEffect(() => {
    const saved = loadSaved()
    setMode(saved?.mode || 'describe')
    setResultText(saved?.text ?? null)
    setError(null)
    setIsGenerating(false)
    setChatMessages([])
    setChatInput('')
    setIsChatStreaming(false)
    setStreamingText(null)
    setImageDataUrl(null)
    abortRef.current?.abort()
    chatAbortRef.current?.abort()
    abortRef.current = null
    chatAbortRef.current = null
  }, [imageSrc, loadSaved])

  // Keep streaming text ref in sync
  useEffect(() => {
    streamingTextRef.current = streamingText ?? ''
  }, [streamingText])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [resultText, isGenerating, chatMessages, streamingText])

  // Fetch image as data URL for chat context (lazy, only when needed)
  const ensureImageDataUrl = useCallback(async (): Promise<string | null> => {
    if (imageDataUrl) return imageDataUrl
    setLoadingImageUrl(true)
    try {
      const res = await fetch(imageSrc)
      if (!res.ok) return null
      const blob = await res.blob()
      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => {
          const url = reader.result as string
          setImageDataUrl(url)
          resolve(url)
        }
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      })
    } catch {
      return null
    } finally {
      setLoadingImageUrl(false)
    }
  }, [imageSrc, imageDataUrl])

  const handleAnalyze = useCallback(async (newMode?: AnalysisMode) => {
    const m = newMode || mode
    if (isGenerating) return
    setResultText(null)
    setError(null)
    setChatMessages([])
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

  // Persist result to localStorage
  useEffect(() => {
    if (resultText) {
      localStorage.setItem(getStorageKey(imageSrc), JSON.stringify({ text: resultText, mode }))
    }
  }, [resultText, mode, imageSrc])

  const handleModeChange = useCallback((newMode: AnalysisMode) => {
    setMode(newMode)
    setResultText(null)
    setError(null)
    setChatMessages([])
  }, [])

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
    setIsGenerating(false)
  }, [])

  // Chat: send message
  const handleChatSend = useCallback(async () => {
    const text = chatInput.trim()
    if (!text || isChatStreaming || !resultText) return

    const dataUrl = await ensureImageDataUrl()
    if (!dataUrl) return

    const userMsg: ChatMsg = { id: `msg-${Date.now()}`, role: 'user', content: text }
    const updatedMessages = [...chatMessages, userMsg]
    setChatMessages(updatedMessages)
    setChatInput('')
    setIsChatStreaming(true)
    setStreamingText('')
    chatAbortRef.current = new AbortController()

    try {
      await chatAboutImage(
        dataUrl,
        resultText,
        updatedMessages.map(m => ({ role: m.role, content: m.content })),
        (chunk) => setStreamingText(chunk),
        chatAbortRef.current.signal,
      )
      // On success, append the final streaming text as assistant message
      const finalText = streamingTextRef.current
      if (finalText) {
        setChatMessages(prev => [...prev, { id: `msg-${Date.now()}`, role: 'assistant', content: finalText }])
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        const errText = (e as Error).message || 'Chat failed'
        setChatMessages(prev => [...prev, { id: `msg-${Date.now()}`, role: 'assistant', content: `*Error: ${errText}*` }])
      } else {
        // On abort, still save partial response
        const partial = streamingTextRef.current
        if (partial) {
          setChatMessages(prev => [...prev, { id: `msg-${Date.now()}`, role: 'assistant', content: partial }])
        }
      }
    } finally {
      setIsChatStreaming(false)
      setStreamingText(null)
      chatAbortRef.current = null
    }
  }, [chatInput, isChatStreaming, resultText, chatMessages, ensureImageDataUrl])

  const handleChatStop = useCallback(() => {
    chatAbortRef.current?.abort()
    setIsChatStreaming(false)
  }, [])

  const handleChatKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleChatSend()
    }
  }, [handleChatSend])

  const hasChat = resultText && !error

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

      <div className="chat-panel-messages" style={hasChat ? {} : { display: 'block' }}>
        {/* Analysis empty state */}
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

        {/* Error state */}
        {error && (
          <div className="summary-panel-error">
            <p>{error}</p>
            <button className="btn btn-ghost btn-sm" onClick={() => handleAnalyze()}>
              Retry
            </button>
          </div>
        )}

        {/* Analysis result */}
        {resultText && (
          <div className="chat-panel-msg chat-panel-msg-assistant">
            <div className="chat-panel-msg-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(resultText) }} />
          </div>
        )}

        {/* Chat messages */}
        {chatMessages.map(msg => (
          <div
            key={msg.id}
            className={`chat-panel-msg ${msg.role === 'user' ? 'chat-panel-msg-user' : 'chat-panel-msg-assistant'}`}
          >
            <div className="chat-panel-msg-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
          </div>
        ))}

        {/* Streaming chat response */}
        {isChatStreaming && streamingText !== null && (
          <div className="chat-panel-msg chat-panel-msg-assistant">
            <div className="chat-panel-msg-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingText) }} />
            <span className="ai-bubble-cursor" />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Footer: input area when analysis is done, otherwise action buttons */}
      {hasChat ? (
        <div className="chat-panel-input-area">
          <div className="chat-panel-input-row">
            <textarea
              ref={textareaRef}
              className="chat-panel-textarea"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={handleChatKeyDown}
              placeholder="Ask about this image..."
              disabled={isChatStreaming || loadingImageUrl}
              rows={1}
            />
            {isChatStreaming ? (
              <button className="chat-panel-send-btn chat-panel-stop-btn" onClick={handleChatStop} title="Stop generating">
                <Square size={14} />
              </button>
            ) : (
              <button
                className="chat-panel-send-btn"
                onClick={handleChatSend}
                disabled={!chatInput.trim() || loadingImageUrl}
                title="Send"
              >
                <Send size={16} />
              </button>
            )}
          </div>
        </div>
      ) : (
        (isGenerating || error) && (
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
        )
      )}
    </div>
  )
}

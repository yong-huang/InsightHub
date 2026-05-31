import { useState, useEffect, useRef, useCallback } from 'react'
import { GripVertical, X, Loader2, Languages, Eye, EyeOff, Send, RotateCcw, BookOpen } from 'lucide-react'
import { callAIStream } from '@/services/aiService'
import { recordUsage } from '@/services/tokenUsageService'
import { useDocumentStore } from '@/stores/documentStore'
import { type TutorMessage, parseRefs, validateRefs, loadShadowHistory, saveShadowHistory, clearShadowHistory, loadShadowData, saveShadowData } from './shadowTypingUtils'

const DEFAULT_SIZE = { width: 480, height: 460 }
const MIN_W = 340
const MIN_H = 260

const SYSTEM_PROMPT = `You are a friendly interactive English tutor. The student has been reading a learning document. Your job is to guide them through typing exercises based on the document content.

How it works:
1. First, read the document to understand the topic and key English expressions.
2. Greet the student briefly (1 sentence, Chinese), then pose your first exercise.
3. Each exercise should ask the student to TYPE something in English — e.g. "请用英语写出会议开场时你会怎么说" or "Try writing a short email confirming the meeting time".
4. After the student responds: give brief encouraging feedback on their English (grammar, vocabulary, naturalness), then pose the NEXT exercise.
5. Make exercises progressive: start with simple phrases, build up to full sentences/paragraphs.

Rules:
- Each response: 2-4 sentences max. Keep it concise.
- Instructions and feedback in Chinese. Exercises/prompts mix Chinese instructions with English examples.
- Be warm and encouraging. Praise what's good before suggesting improvements.
- Vary exercise types: fill-in phrases, write a dialogue line, summarize a point, etc.
- Always base exercises on the document's actual content and vocabulary.
- Never repeat the same exercise. Always move forward.
- IMPORTANT: Progress through the ENTIRE document, not just the beginning. After covering the first section's content, move on to the next topic/section. The document has multiple sections — cover them all over the course of the session.
- IMPORTANT: At the end of each response, append a reference line in this exact format: [ref:keyword1, keyword2]
  These are 1-2 short keywords or phrases from the document that are topically relevant to the current exercise.
  The two refs should be on the same topic but from DIFFERENT parts of the document (e.g. different examples, different contexts, or different sections covering the same theme).
  Do NOT pick refs from adjacent paragraphs or the same block of text.
  Example for an exercise about meeting openings: [ref:Good morning everyone, I'd like to call this meeting to order] — both about opening a meeting, but from different examples in the document.`

interface ShadowTypingPanelProps {
  docId: string
  onClose: () => void
  onScrollToText?: (keyword: string) => void
}

export function ShadowTypingPanel({ docId, onClose, onScrollToText }: ShadowTypingPanelProps) {
  const initial = useRef(loadShadowData(docId))
  const [messages, setMessages] = useState<TutorMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isTranslucent, setIsTranslucent] = useState(true)
  const [streamingContent, setStreamingContent] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const conversationRef = useRef<{ role: string; content: string }[]>([])
  const docContentRef = useRef('')

  // Set initial position/size
  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    el.style.left = `${initial.current.position.x}px`
    el.style.top = `${initial.current.position.y}px`
    el.style.width = `${initial.current.size.width}px`
    el.style.height = `${initial.current.size.height}px`
  }, [])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // Cleanup
  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  // Restore saved history on mount (synchronous)
  const restored = useRef(false)
  useEffect(() => {
    const saved = loadShadowHistory(docId)
    if (saved.length > 0) {
      setMessages(saved)
      restored.current = true
      // Rebuild conversationRef for continued interaction
      conversationRef.current = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...saved.map(m => ({ role: m.role === 'ai' ? 'assistant' as const : 'user' as const, content: m.content }))
      ]
      // Load doc content for ref validation
      useDocumentStore.getState().ensureContentText(docId).then(doc => {
        docContentRef.current = doc?.contentText || ''
      })
    }
  }, [docId])

  // Start AI session when no saved history exists
  useEffect(() => {
    if (restored.current) return
    startSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const callAI = useCallback(async (messages: { role: string; content: string }[], onChunk: (text: string) => void) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsStreaming(true)
    setStreamingContent('')

    try {
      const result = await callAIStream(messages, onChunk, controller.signal)
      if (result.usage) recordUsage('shadow-typing', result.usage)
      if (result.success === false && !controller.signal.aborted) {
        setStreamingContent('')
      }
    } catch {
      if (!controller.signal.aborted) setStreamingContent('')
    } finally {
      if (abortRef.current === controller) {
        setIsStreaming(false)
      }
    }
  }, [])

  const startSession = useCallback(async () => {
    setMessages([])
    setStreamingContent('')
    setInputText('')
    conversationRef.current = []

    // Always load doc content for ref validation
    try {
      const doc = await useDocumentStore.getState().ensureContentText(docId)
      docContentRef.current = doc?.contentText || ''
    } catch { /* ignore */ }

    try {
      const doc = await useDocumentStore.getState().ensureContentText(docId)
      const docContent = doc?.contentText || ''
      docContentRef.current = docContent
      // Send full document (up to 12k chars) so AI can cover all sections
      const truncated = docContent.slice(0, 12000)

      const systemMsg = { role: 'system', content: SYSTEM_PROMPT }
      const userMsg = { role: 'user', content: `Here is the FULL document the student has been studying:\n\`\`\`\n${truncated}\n\`\`\`\n${docContent.length > 12000 ? `\n(Document truncated at 12000 chars, total ${docContent.length} chars.)\n` : ''}Please start the interactive English typing exercise. Cover different sections of the document progressively — do NOT stay on the first section.` }

      conversationRef.current = [systemMsg, userMsg]

      await callAI([systemMsg, userMsg], (text) => {
        setStreamingContent(text)
      })
    } catch {
      // ignore
    }
  }, [docId, callAI])

  // When streaming ends, finalize the AI message
  useEffect(() => {
    if (!isStreaming && streamingContent) {
      const { content, refs } = parseRefs(streamingContent)
      const validRefs = validateRefs(refs, docContentRef.current)
      const aiMsg: TutorMessage = { role: 'ai', content, refs: validRefs }
      setMessages(prev => {
        const next = [...prev, aiMsg]
        saveShadowHistory(docId, next)
        return next
      })
      conversationRef.current.push({ role: 'assistant', content: streamingContent })
      setStreamingContent('')
    }
  }, [isStreaming, streamingContent, docId])

  const handleSubmit = useCallback(async () => {
    const text = inputText.trim()
    if (!text || isStreaming) return

    // Add user message
    const userMsg: TutorMessage = { role: 'user', content: text }
    setMessages(prev => {
      const next = [...prev, userMsg]
      saveShadowHistory(docId, next)
      return next
    })
    conversationRef.current.push({ role: 'user', content: text })
    setInputText('')

    // Resize textarea back
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    // Call AI with full conversation
    const allMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationRef.current.filter(m => m.role !== 'system'),
    ]

    await callAI(allMessages, (text) => {
      setStreamingContent(text)
    })
  }, [inputText, isStreaming, callAI])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  // Auto-resize textarea
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }, [])

  const handleReset = useCallback(() => {
    abortRef.current?.abort()
    clearShadowHistory(docId)
    startSession()
  }, [docId, startSession])

  // Drag via pointer capture
  const onTitleBarPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const el = panelRef.current
    if (!el) return
    el.setPointerCapture(e.pointerId)
    const offsetX = e.clientX - el.getBoundingClientRect().left
    const offsetY = e.clientY - el.getBoundingClientRect().top

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault()
      el.style.left = `${ev.clientX - offsetX}px`
      el.style.top = `${ev.clientY - offsetY}px`
    }
    const lost = () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('lostpointercapture', lost)
      saveShadowData(docId, {
        position: { x: parseFloat(el.style.left), y: parseFloat(el.style.top) },
      })
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('lostpointercapture', lost)
  }, [docId])

  // Resize via pointer capture
  const onResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const direction = (e.currentTarget as HTMLElement).dataset.resize as string
    const el = panelRef.current
    if (!el) return
    el.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const startY = e.clientY
    const startRect = el.getBoundingClientRect()
    const startW = startRect.width
    const startH = startRect.height
    const startL = startRect.left
    const startT = startRect.top

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault()
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      let newL = startL, newT = startT, newW = startW, newH = startH
      if (direction.includes('e')) newW = startW + dx
      if (direction.includes('w')) { newW = startW - dx; newL = startL + dx }
      if (direction.includes('s')) newH = startH + dy
      if (direction.includes('n')) { newH = startH - dy; newT = startT + dy }
      newW = Math.max(MIN_W, newW)
      newH = Math.max(MIN_H, newH)
      el.style.left = `${newL}px`
      el.style.top = `${newT}px`
      el.style.width = `${newW}px`
      el.style.height = `${newH}px`
    }
    const lost = () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('lostpointercapture', lost)
      saveShadowData(docId, {
        position: { x: parseFloat(el.style.left), y: parseFloat(el.style.top) },
        size: { width: el.offsetWidth, height: el.offsetHeight },
      })
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('lostpointercapture', lost)
  }, [docId])

  const canSubmit = inputText.trim().length > 0 && !isStreaming

  return (
    <div
      ref={panelRef}
      className={`code-editor-panel${isTranslucent ? ' translucent' : ''} ce-light shadow-typing-panel`}
    >
      <div className="code-editor-titlebar" onPointerDown={onTitleBarPointerDown}>
        <GripVertical size={14} className="code-editor-grip" />
        <Languages size={13} className="code-editor-grip" />
        <span className="code-editor-title">Shadow Typing</span>
        <div style={{ display: 'flex', gap: '2px', marginLeft: 'auto' }}>
          <button
            className="code-editor-action-btn"
            onClick={handleReset}
            onMouseDown={e => e.stopPropagation()}
            title="Restart Session"
            disabled={isStreaming}
          >
            <RotateCcw size={13} />
          </button>
          <button
            className="code-editor-action-btn"
            onClick={() => setIsTranslucent(v => !v)}
            onMouseDown={e => e.stopPropagation()}
            title={isTranslucent ? 'Opaque' : 'Translucent'}
          >
            {isTranslucent ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
        <button className="code-editor-close-btn" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      <div className="shadow-tutor-content">
        {/* Message list */}
        <div className="shadow-tutor-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`shadow-tutor-msg shadow-tutor-msg-${msg.role}`}>
              <div className="shadow-tutor-msg-bubble">
                {msg.content}
                {msg.role === 'ai' && msg.refs && msg.refs.length > 0 && (
                  <div className="shadow-tutor-refs">
                    {msg.refs.map((ref, j) => (
                      <button
                        key={j}
                        className="shadow-tutor-ref-link"
                        onClick={() => onScrollToText?.(ref)}
                        title={`Jump to: ${ref}`}
                      >
                        <BookOpen size={10} />
                        <span>{ref.length > 30 ? ref.slice(0, 30) + '...' : ref}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isStreaming && streamingContent && (
            <div className="shadow-tutor-msg shadow-tutor-msg-ai">
              <div className="shadow-tutor-msg-bubble">
                {streamingContent}
                <Loader2 size={10} className="shadow-tutor-cursor" />
              </div>
            </div>
          )}
          {!isStreaming && messages.length === 0 && !streamingContent && (
            <div className="shadow-tutor-empty">
              <Loader2 size={18} className="spin" />
              <span>Reading document...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="shadow-tutor-input">
          <textarea
            ref={textareaRef}
            className="shadow-tutor-textarea"
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type your answer..."
            rows={1}
            spellCheck
          />
          <button
            className={`shadow-tutor-send${canSubmit ? '' : ' disabled'}`}
            onClick={handleSubmit}
            disabled={!canSubmit}
            title="Send (Cmd+Enter)"
          >
            {isStreaming ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>

      {/* Edge resize handles */}
      <div className="ce-resize ce-resize-n" data-resize="n" onPointerDown={onResizePointerDown} />
      <div className="ce-resize ce-resize-s" data-resize="s" onPointerDown={onResizePointerDown} />
      <div className="ce-resize ce-resize-e" data-resize="e" onPointerDown={onResizePointerDown} />
      <div className="ce-resize ce-resize-w" data-resize="w" onPointerDown={onResizePointerDown} />
      <div className="ce-resize ce-resize-ne" data-resize="ne" onPointerDown={onResizePointerDown} />
      <div className="ce-resize ce-resize-se" data-resize="se" onPointerDown={onResizePointerDown} />
      <div className="ce-resize ce-resize-nw" data-resize="nw" onPointerDown={onResizePointerDown} />
      <div className="ce-resize ce-resize-sw" data-resize="sw" onPointerDown={onResizePointerDown} />
    </div>
  )
}

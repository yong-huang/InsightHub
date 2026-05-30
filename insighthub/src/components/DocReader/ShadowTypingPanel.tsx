import { useState, useEffect, useRef, useCallback } from 'react'
import { GripVertical, X, Loader2, Languages, Eye, EyeOff } from 'lucide-react'
import { callAIStream } from '@/services/aiService'
import { useDocumentStore } from '@/stores/documentStore'

const DEFAULT_SIZE = { width: 560, height: 420 }
const MIN_W = 340
const MIN_H = 220

function loadShadowData(docId: string): { position: { x: number; y: number }; size: { width: number; height: number } } {
  const defaults = {
    position: { x: Math.max(40, window.innerWidth - DEFAULT_SIZE.width - 40), y: 160 },
    size: DEFAULT_SIZE,
  }
  try {
    const all = JSON.parse(localStorage.getItem('insighthub:shadow-typing') || '{}')
    const saved = all[docId]
    if (!saved) return defaults
    return {
      position: {
        x: saved.position?.x ?? defaults.position.x,
        y: Math.max(120, saved.position?.y ?? defaults.position.y),
      },
      size: saved.size || defaults.size,
    }
  } catch {
    return defaults
  }
}

function saveShadowData(docId: string, data: Partial<{ position: { x: number; y: number }; size: { width: number; height: number } }>) {
  try {
    const all = JSON.parse(localStorage.getItem('insighthub:shadow-typing') || '{}')
    all[docId] = { ...all[docId], ...data }
    localStorage.setItem('insighthub:shadow-typing', JSON.stringify(all))
  } catch { /* quota exceeded */ }
}

interface ShadowTypingPanelProps {
  docId: string
  onClose: () => void
}

export function ShadowTypingPanel({ docId, onClose }: ShadowTypingPanelProps) {
  const initial = useRef(loadShadowData(docId))
  const [text, setText] = useState('')
  const [hint, setHint] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isTranslucent, setIsTranslucent] = useState(true)
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const panelRef = useRef<HTMLDivElement>(null)
  const hintBodyRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Set initial position/size
  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    el.style.left = `${initial.current.position.x}px`
    el.style.top = `${initial.current.position.y}px`
    el.style.width = `${initial.current.size.width}px`
    el.style.height = `${initial.current.size.height}px`
  }, [])

  // Auto-scroll hint panel
  useEffect(() => {
    if (hintBodyRef.current) {
      hintBodyRef.current.scrollTop = hintBodyRef.current.scrollHeight
    }
  }, [hint])

  // Cleanup
  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current)
      abortRef.current?.abort()
    }
  }, [])

  const requestHint = useCallback(async (userText: string) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsStreaming(true)
    setHint('')

    try {
      const doc = await useDocumentStore.getState().ensureContentText(docId)
      const docContent = doc?.contentText || ''
      // Extract only English sentences from the document (skip Chinese text and headers)
      const englishLines = docContent.split('\n').filter(line => /^[A-Za-z]/.test(line.trim()) && line.trim().length > 5)
      const englishText = englishLines.join('\n').slice(0, 3000)

      await callAIStream(
        [
          { role: 'system', content: `You are a friendly English tutor. The student is practicing "shadow typing" — reading English text from a learning document, then retyping what they remember in their own words. This is an English learning exercise, NOT a dictation test.

The reference document is a bilingual learning page (Chinese explanations + English examples/dialogues). Only the English portions are relevant.

Evaluation criteria:
- Compare the student's English text against the English sentences in the reference
- Check grammar correctness and natural phrasing
- Notice if key vocabulary or expressions from the reference are used
- Ignore differences in wording, synonyms, or sentence structure — meaning matters, not exact words
- Be encouraging! Praise what they got right before noting improvements
- If the student only typed a short fragment, gently suggest they try to include more from what they read

Tone: warm, encouraging, like a supportive tutor. Never harsh or critical. Output in Chinese (中文), 2-3 sentences max.` },
          { role: 'user', content: englishText
            ? `English text from the document:\n\`\`\`\n${englishText}\n\`\`\`\n\nStudent's retyped text:\n\`\`\`\n${userText}\n\`\`\``
            : `Student's retyped text (no English reference found in document):\n\`\`\`\n${userText}\n\`\`\`` },
        ],
        (chunk) => {
          setHint(chunk)
        },
        controller.signal,
      )
    } catch {
      if (!controller.signal.aborted) setHint('')
    } finally {
      if (abortRef.current === controller) {
        setIsStreaming(false)
      }
    }
  }, [docId])

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setText(val)
    if (val.trim()) {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => requestHint(val), 2000)
    }
  }, [requestHint])

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
            onClick={() => setIsTranslucent(v => !v)}
            onMouseDown={e => e.stopPropagation()}
            title={isTranslucent ? 'Opaque' : 'Translucent'}
          >
            {isTranslucent ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
          <button
            className="code-editor-action-btn"
            onClick={() => { setText(''); setHint(''); clearTimeout(timerRef.current); abortRef.current?.abort() }}
            onMouseDown={e => e.stopPropagation()}
            title="Clear"
            disabled={!text}
          >
            <X size={13} />
          </button>
        </div>
        <button className="code-editor-close-btn" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      <div className="shadow-typing-content">
        <div className="shadow-typing-editor">
          <textarea
            ref={textareaRef}
            className="shadow-typing-textarea"
            value={text}
            onChange={handleTextChange}
            placeholder="Read English text from the document, then type your version here..."
            spellCheck
          />
        </div>
        <div className="shadow-typing-hint">
          <div className="code-editor-coach-header">
            <Languages size={13} />
            <span>Feedback</span>
            {isStreaming && <Loader2 size={12} className="spin" />}
          </div>
          <div className="code-editor-coach-body" ref={hintBodyRef}>
            {hint || (isStreaming ? '' : 'Type your text to get AI feedback...')}
          </div>
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

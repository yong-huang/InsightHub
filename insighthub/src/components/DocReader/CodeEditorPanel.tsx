import { useState, useEffect, useRef, useCallback } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { python } from '@codemirror/lang-python'
import { javascript } from '@codemirror/lang-javascript'
import { java } from '@codemirror/lang-java'
import { cpp } from '@codemirror/lang-cpp'
import { rust } from '@codemirror/lang-rust'
import { sql } from '@codemirror/lang-sql'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { xml } from '@codemirror/lang-xml'
import { go } from '@codemirror/lang-go'
import { oneDark } from '@codemirror/theme-one-dark'
import { acceptCompletion, closeCompletion, completionStatus } from '@codemirror/autocomplete'
import { keymap, EditorView } from '@codemirror/view'
import { Prec } from '@codemirror/state'
import { GripVertical, X, Trash2, Sparkles, Loader2, Eye, EyeOff, GraduationCap, Play } from 'lucide-react'
import { callAIStream } from '@/services/aiService'
import { useDocumentStore } from '@/stores/documentStore'

const LANGUAGES = [
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'go', label: 'Go' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'rust', label: 'Rust' },
  { value: 'sql', label: 'SQL' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'xml', label: 'XML' },
  { value: 'plaintext', label: 'Plain Text' },
] as const

type EditorTheme = 'auto' | 'light' | 'dark'

type LangValue = (typeof LANGUAGES)[number]['value']

function getLangExtension(lang: LangValue) {
  switch (lang) {
    case 'python': return python()
    case 'javascript': return javascript()
    case 'typescript': return javascript({ typescript: true })
    case 'go': return go()
    case 'java': return java()
    case 'cpp': return cpp()
    case 'rust': return rust()
    case 'sql': return sql()
    case 'html': return html()
    case 'css': return css()
    case 'json': return json()
    case 'markdown': return markdown()
    case 'xml': return xml()
    default: return []
  }
}

interface EditorData {
  language: LangValue
  editorTheme: EditorTheme
  position: { x: number; y: number }
  size: { width: number; height: number }
}

const DEFAULT_SIZE = { width: 520, height: 400 }
const MIN_W = 360
const MIN_H = 240

function loadEditorData(docId: string): EditorData {
  const defaults: EditorData = {
    language: 'python' as LangValue,
    editorTheme: 'auto' as EditorTheme,
    position: { x: Math.max(40, window.innerWidth - DEFAULT_SIZE.width - 40), y: 120 },
    size: DEFAULT_SIZE,
  }
  try {
    const all = JSON.parse(localStorage.getItem('insighthub:code-editor') || '{}')
    const saved = all[docId]
    if (!saved) return defaults
    return {
      language: saved.language || defaults.language,
      editorTheme: saved.editorTheme || defaults.editorTheme,
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

function saveEditorData(docId: string, data: Partial<EditorData>) {
  try {
    const all = JSON.parse(localStorage.getItem('insighthub:code-editor') || '{}')
    all[docId] = { ...all[docId], ...data }
    localStorage.setItem('insighthub:code-editor', JSON.stringify(all))
  } catch { /* quota exceeded — silently skip */ }
}

interface CodeEditorPanelProps {
  docId: string
  initialText?: string
  onClose: () => void
}

export function CodeEditorPanel({ docId, initialText, onClose }: CodeEditorPanelProps) {
  const initial = useRef(loadEditorData(docId))
  const [language, setLanguage] = useState<LangValue>(initial.current.language)
  const [editorTheme, setEditorTheme] = useState<EditorTheme>(initial.current.editorTheme)
  const [code, setCode] = useState(initialText ?? '')
  const [isReviewing, setIsReviewing] = useState(false)
  const [isTranslucent, setIsTranslucent] = useState(true)
  const [coachMode, setCoachMode] = useState(false)
  const [hint, setHint] = useState('')
  const [isCoaching, setIsCoaching] = useState(false)
  const [runOutput, setRunOutput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [showOutput, setShowOutput] = useState(false)
  const [availableRuntimes, setAvailableRuntimes] = useState<Set<string>>(new Set())
  const runAbortRef = useRef<AbortController | null>(null)
  const outputBodyRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const coachBodyRef = useRef<HTMLDivElement>(null)
  const coachTimer = useRef<ReturnType<typeof setTimeout>>()
  const coachAbortRef = useRef<AbortController | null>(null)
  const [themeKey, setThemeKey] = useState(0)

  const globalIsDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const isDark = editorTheme !== 'auto' ? editorTheme === 'dark' : globalIsDark

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeKey(k => k + 1))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  // Pinned horizontal scrollbar: hide native, sync a fake one at the bottom of code-editor-body
  const hscrollBarRef = useRef<HTMLDivElement>(null)
  const hscrollThumbRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    requestAnimationFrame(() => {
      const body = panelRef.current?.querySelector('.code-editor-body')
      const scroller = body?.querySelector('.cm-scroller') as HTMLElement | null
      const bar = hscrollBarRef.current
      const thumb = hscrollThumbRef.current
      if (!scroller || !bar || !thumb) return

      // Hide native horizontal scrollbar, keep vertical scroll
      scroller.style.overflowX = 'hidden'
      scroller.style.overflowY = 'auto'

      const sync = () => {
        const sw = scroller.scrollWidth
        const vw = scroller.clientWidth
        if (sw <= vw + 1) { bar.style.opacity = '0'; return }
        bar.style.opacity = '1'
        const ratio = vw / sw
        const thumbW = Math.max(30, vw * ratio)
        const trackW = vw - thumbW
        const pos = sw > vw ? scroller.scrollLeft / (sw - vw) : 0
        thumb.style.width = `${thumbW}px`
        thumb.style.transform = `translateX(${pos * trackW}px)`
      }

      // Drag thumb to scroll
      let dragging = false, startX = 0, startScroll = 0
      const onDown = (e: PointerEvent) => {
        e.preventDefault()
        dragging = true
        startX = e.clientX
        startScroll = scroller.scrollLeft
        thumb.setPointerCapture(e.pointerId)
      }
      const onMove = (e: PointerEvent) => {
        if (!dragging) return
        const scrollable = scroller.scrollWidth - scroller.clientWidth
        if (scrollable <= 0) return
        const trackW = scroller.clientWidth - 30
        scroller.scrollLeft = startScroll + ((e.clientX - startX) / Math.max(30, trackW)) * scrollable
      }
      const onUp = () => { dragging = false }

      thumb.addEventListener('pointerdown', onDown)
      thumb.addEventListener('pointermove', onMove)
      thumb.addEventListener('pointerup', onUp)
      thumb.addEventListener('lostpointercapture', onUp)

      // Shift+wheel → horizontal scroll
      const onWheel = (e: WheelEvent) => {
        if (e.shiftKey) {
          e.preventDefault()
          scroller.scrollLeft += e.deltaY || e.deltaX
        }
      }
      body!.addEventListener('wheel', onWheel, { passive: false })

      scroller.addEventListener('scroll', sync)
      const ro = new ResizeObserver(sync)
      ro.observe(scroller)
      ro.observe(body!)
      sync()

      return () => {
        thumb.removeEventListener('pointerdown', onDown)
        thumb.removeEventListener('pointermove', onMove)
        thumb.removeEventListener('pointerup', onUp)
        thumb.removeEventListener('lostpointercapture', onUp)
        body!.removeEventListener('wheel', onWheel)
        scroller.removeEventListener('scroll', sync)
        ro.disconnect()
        scroller.style.overflowX = ''
        scroller.style.overflowY = ''
      }
    })
  }, [themeKey])

  // Set initial position/size once via DOM (not React style) to avoid re-render overwrites
  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    el.style.left = `${initial.current.position.x}px`
    el.style.top = `${initial.current.position.y}px`
    el.style.width = `${initial.current.size.width}px`
    el.style.height = `${initial.current.size.height}px`
  }, [])

  // Widen panel when coach opens, shrink back when closed
  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    el.style.width = coachMode ? '800px' : `${initial.current.size.width}px`
    saveEditorData(docId, { size: { width: el.offsetWidth, height: el.offsetHeight } })
  }, [coachMode, docId])

  const requestCoachHint = useCallback(async (userCode: string) => {
    // Abort previous request
    coachAbortRef.current?.abort()
    const controller = new AbortController()
    coachAbortRef.current = controller

    setIsCoaching(true)
    setHint('')

    try {
      const doc = await useDocumentStore.getState().ensureContentText(docId)
      const docContent = doc?.contentText || ''
      const truncatedDoc = docContent.length > 3000 ? docContent.slice(0, 3000) : docContent

      await callAIStream(
        [
          { role: 'system', content: `<think step by step>\nYou are a coding tutor. The student is practicing by copying code from a document. The programming language is ${LANGUAGES.find(l => l.value === language)?.label || language}. Based on the reference code below, provide a hint (2-3 sentences, max 80 words) to help them continue. Explain WHY the next step is needed, not just WHAT to type. For example: explain the algorithmic reason behind the code structure, what problem the next piece solves, or how it connects to what they already wrote. Do NOT give the full answer or rewrite their code. If the code is complete and correct, say "很好，代码完成！". Always output in Chinese (中文).` },
          { role: 'user', content: `Reference code from document (${language}):\n${truncatedDoc}\n\nStudent's current ${language} code:\n${userCode}` },
        ],
        (chunk) => {
          setHint(chunk)
        },
        controller.signal,
      )
    } catch {
      if (!controller.signal.aborted) setHint('')
    } finally {
      if (coachAbortRef.current === controller) {
        setIsCoaching(false)
      }
    }
  }, [docId, language])

  // Auto-scroll coach panel to bottom as hints stream in
  useEffect(() => {
    if (coachBodyRef.current) {
      coachBodyRef.current.scrollTop = coachBodyRef.current.scrollHeight
    }
  }, [hint])

  // Cleanup coach timer and abort on unmount
  useEffect(() => {
    return () => {
      clearTimeout(coachTimer.current)
      coachAbortRef.current?.abort()
      runAbortRef.current?.abort()
    }
  }, [])

  // Fetch available runtimes on mount
  useEffect(() => {
    fetch('/api/code-runtimes')
      .then(r => r.json())
      .then((langs: string[]) => setAvailableRuntimes(new Set(langs)))
      .catch(() => {})
  }, [])

  // Auto-scroll output panel
  useEffect(() => {
    if (outputBodyRef.current) {
      outputBodyRef.current.scrollTop = outputBodyRef.current.scrollHeight
    }
  }, [runOutput])

  const handleRunCode = useCallback(async () => {
    if (!code.trim() || isRunning || !availableRuntimes.has(language)) return
    runAbortRef.current?.abort()
    const controller = new AbortController()
    runAbortRef.current = controller

    setIsRunning(true)
    setRunOutput('')
    setShowOutput(true)

    try {
      const res = await fetch('/api/code-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language }),
        signal: controller.signal,
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let output = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value, { stream: true })
        // Parse SSE lines: data: "content"\n\n
        const lines = text.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const chunk = JSON.parse(line.slice(6))
              output += chunk
              setRunOutput(output)
            } catch {
              // Append raw if not valid JSON
              output += line.slice(6)
              setRunOutput(output)
            }
          }
        }
      }
    } catch (e: any) {
      if (!controller.signal.aborted) {
        setRunOutput(prev => prev + `\n[Error] ${e.message}\n`)
      }
    } finally {
      if (runAbortRef.current === controller) setIsRunning(false)
    }
  }, [code, language, isRunning, availableRuntimes])

  const handleCodeChange = useCallback((newCode: string) => {
    setCode(newCode)
    // Debounce coach hint request
    if (coachMode && newCode.trim()) {
      clearTimeout(coachTimer.current)
      coachTimer.current = setTimeout(() => requestCoachHint(newCode), 2000)
    }
  }, [coachMode, requestCoachHint])

  const handleLanguageChange = useCallback((newLang: LangValue) => {
    setLanguage(newLang)
    saveEditorData(docId, { language: newLang })
  }, [docId])

  const handleEditorThemeChange = useCallback((t: EditorTheme) => {
    setEditorTheme(t)
    saveEditorData(docId, { editorTheme: t })
  }, [docId])

  const handleAIReview = useCallback(async () => {
    if (!code.trim() || isReviewing) return
    setIsReviewing(true)
    const langLabel = LANGUAGES.find(l => l.value === language)?.label || language
    const commentStyle: Record<string, string> = {
      python: '#', javascript: '//', typescript: '//', go: '//',
      java: '//', cpp: '//', rust: '//', sql: '--',
      html: '<!-- -->', css: '/* */', json: '//',
      markdown: '<!-- -->', xml: '<!-- -->', plaintext: '//',
    }
    const cs = commentStyle[language] || '//'
    const commentBlock = language === 'python'
      ? '# REVIEW: ...'
      : language === 'sql' || language === 'html' || language === 'xml' || language === 'markdown'
        ? '-- REVIEW: ...' : '// REVIEW: ...'
    try {
      const result = await callAIStream([
        { role: 'system', content: `You are a senior code reviewer reviewing ${langLabel} code.
Rules:
- Do NOT modify the original code logic
- Add inline review comments using ${cs} syntax to point out issues, improvements, or suggestions
- Place each comment directly above the relevant line
- Keep comments concise (one line each)
- If the code is already good, add a brief comment at the top saying so
- Output ONLY the annotated code, no extra text, no markdown fences` },
        { role: 'user', content: code },
      ])
      if (result.data) {
        let reviewed = result.data
        // Strip markdown code fences if the model wraps output in them
        reviewed = reviewed.replace(/^```[\w]*\n?/, '').replace(/\n?```\s*$/, '')
        setCode(reviewed)
      }
    } catch { /* ignore AI errors */ }
    finally { setIsReviewing(false) }
  }, [code, language, isReviewing])

  // Drag via pointer capture
  const onTitleBarPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, select')) return
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
      saveEditorData(docId, {
        position: { x: parseFloat(el.style.left), y: parseFloat(el.style.top) },
      })
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('lostpointercapture', lost)
  }, [docId])

  // Resize via pointer capture — supports all edges and corners
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
      saveEditorData(docId, {
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
      className={`code-editor-panel${isTranslucent ? ' translucent' : ''}${isDark ? ' ce-dark' : ' ce-light'}`}
    >
      <div className="code-editor-titlebar" onPointerDown={onTitleBarPointerDown}>
        <GripVertical size={14} className="code-editor-grip" />
        <span className="code-editor-title">Code</span>
        <select
          className="code-editor-lang-select"
          value={language}
          onChange={e => handleLanguageChange(e.target.value as LangValue)}
          onMouseDown={e => e.stopPropagation()}
        >
          {LANGUAGES.map(l => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
        <select
          className="code-editor-lang-select"
          value={editorTheme}
          onChange={e => handleEditorThemeChange(e.target.value as EditorTheme)}
          onMouseDown={e => e.stopPropagation()}
        >
          <option value="auto">Auto</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
        <div style={{ display: 'flex', gap: '2px', marginLeft: 'auto' }}>
          <button
            className={`code-editor-action-btn${coachMode ? ' active' : ''}`}
            onClick={() => {
              setCoachMode(v => !v)
              setHint('')
              clearTimeout(coachTimer.current)
              coachAbortRef.current?.abort()
            }}
            onMouseDown={e => e.stopPropagation()}
            title={coachMode ? 'Close Coach' : 'AI Coach'}
          >
            <GraduationCap size={13} />
          </button>
          <button
            className={`code-editor-action-btn${showOutput ? ' active' : ''}`}
            onClick={handleRunCode}
            onMouseDown={e => e.stopPropagation()}
            title="Run Code"
            disabled={!code.trim() || isRunning || !availableRuntimes.has(language)}
          >
            {isRunning ? <Loader2 size={13} className="spin" /> : <Play size={13} />}
          </button>
          <button
            className="code-editor-action-btn"
            onClick={handleAIReview}
            onMouseDown={e => e.stopPropagation()}
            title="AI Review"
            disabled={!code.trim() || isReviewing}
          >
            {isReviewing ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
          </button>
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
            onClick={() => setCode('')}
            onMouseDown={e => e.stopPropagation()}
            title="Clear"
            disabled={!code}
          >
            <Trash2 size={13} />
          </button>
        </div>
        <button className="code-editor-close-btn" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      <div className={`code-editor-content-area${showOutput ? ' with-output' : ''}`}>
        <div className={`code-editor-main${coachMode ? ' with-coach' : ''}`}>
          <div className="code-editor-body" key={themeKey} onClick={() => {
            const editor = panelRef.current?.querySelector('.cm-content')
            if (editor) (editor as HTMLElement).focus()
          }}>
            <CodeMirror
              value={code}
              onChange={handleCodeChange}
              extensions={[
                getLangExtension(language),
                Prec.highest(keymap.of([
                  { key: 'Tab', run: (view) => {
                    if (completionStatus(view.state) !== null) return acceptCompletion(view)
                    const { from } = view.state.selection.main
                    view.dispatch({ changes: { from, insert: '    ' }, selection: { anchor: from + 4 } })
                    return true
                  }},
                ])),
                EditorView.domEventHandlers({
                  keydown: (event, view) => {
                    if (event.key === 'Escape' && completionStatus(view.state) !== null) {
                      event.preventDefault()
                      event.stopPropagation()
                      closeCompletion(view)
                      return true
                    }
                    return false
                  },
                }),
              ]}
              theme={isDark ? oneDark : undefined}
              basicSetup={{
                lineNumbers: true,
                highlightActiveLineGutter: true,
                highlightActiveLine: true,
                foldGutter: true,
                autocompletion: true,
                bracketMatching: true,
                closeBrackets: true,
                indentOnInput: true,
                tabSize: 4,
                indentUnit: 4,
              }}
            />
            <div className="ce-hscroll" ref={hscrollBarRef}>
              <div className="ce-hscroll-thumb" ref={hscrollThumbRef} />
            </div>
          </div>
          {coachMode && (
            <div className="code-editor-coach">
              <div className="code-editor-coach-header">
                <GraduationCap size={13} />
                <span>Coach</span>
                {isCoaching && <Loader2 size={12} className="spin" />}
                <button
                  className="code-editor-action-btn"
                  onClick={() => { setCoachMode(false); setHint(''); clearTimeout(coachTimer.current); coachAbortRef.current?.abort() }}
                  onMouseDown={e => e.stopPropagation()}
                  title="Close Coach"
                >
                  <X size={12} />
                </button>
              </div>
              <div className="code-editor-coach-body" ref={coachBodyRef}>
                {hint || (isCoaching ? '' : 'Start typing code to get hints...')}
              </div>
            </div>
          )}
        </div>
        {showOutput && (
          <div className="code-editor-output">
            <div className="code-editor-output-header">
              <Play size={13} />
              <span>Output</span>
              {isRunning && <Loader2 size={12} className="spin" />}
              <button
                className="code-editor-action-btn"
                onClick={() => setShowOutput(false)}
                onMouseDown={e => e.stopPropagation()}
                title="Close Output"
              >
                <X size={12} />
              </button>
            </div>
            <div className="code-editor-output-body" ref={outputBodyRef}>
              {runOutput || (isRunning ? '' : 'Run code to see output here...')}
            </div>
          </div>
        )}
      </div>

      {/* Edge resize handles */}
      <div className="ce-resize ce-resize-n" data-resize="n" onPointerDown={onResizePointerDown} />
      <div className="ce-resize ce-resize-s" data-resize="s" onPointerDown={onResizePointerDown} />
      <div className="ce-resize ce-resize-e" data-resize="e" onPointerDown={onResizePointerDown} />
      <div className="ce-resize ce-resize-w" data-resize="w" onPointerDown={onResizePointerDown} />
      {/* Corner resize handles */}
      <div className="ce-resize ce-resize-ne" data-resize="ne" onPointerDown={onResizePointerDown} />
      <div className="ce-resize ce-resize-se" data-resize="se" onPointerDown={onResizePointerDown} />
      <div className="ce-resize ce-resize-nw" data-resize="nw" onPointerDown={onResizePointerDown} />
      <div className="ce-resize ce-resize-sw" data-resize="sw" onPointerDown={onResizePointerDown} />
    </div>
  )
}

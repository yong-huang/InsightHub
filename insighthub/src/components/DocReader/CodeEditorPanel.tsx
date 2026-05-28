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
import { GripVertical, X, Trash2, Sparkles, Loader2, Eye, EyeOff } from 'lucide-react'
import { callAIStream } from '@/services/aiService'

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
    position: { x: Math.max(40, window.innerWidth - DEFAULT_SIZE.width - 40), y: 80 },
    size: DEFAULT_SIZE,
  }
  try {
    const all = JSON.parse(localStorage.getItem('insighthub:code-editor') || '{}')
    const saved = all[docId]
    if (!saved) return defaults
    return {
      language: saved.language || defaults.language,
      editorTheme: saved.editorTheme || defaults.editorTheme,
      position: saved.position || defaults.position,
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
  const [isTranslucent, setIsTranslucent] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const [themeKey, setThemeKey] = useState(0)

  const globalIsDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const isDark = editorTheme !== 'auto' ? editorTheme === 'dark' : globalIsDark

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeKey(k => k + 1))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  // Set initial position/size once via DOM (not React style) to avoid re-render overwrites
  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    el.style.left = `${initial.current.position.x}px`
    el.style.top = `${initial.current.position.y}px`
    el.style.width = `${initial.current.size.width}px`
    el.style.height = `${initial.current.size.height}px`
  }, [])

  const handleCodeChange = useCallback((newCode: string) => {
    setCode(newCode)
  }, [])

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
      if (result.data) setCode(result.data)
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

  // Resize via pointer capture
  const onResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const el = panelRef.current
    if (!el) return
    el.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const startY = e.clientY
    const startW = el.offsetWidth
    const startH = el.offsetHeight

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault()
      el.style.width = `${Math.max(MIN_W, startW + ev.clientX - startX)}px`
      el.style.height = `${Math.max(MIN_H, startH + ev.clientY - startY)}px`
    }
    const lost = () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('lostpointercapture', lost)
      saveEditorData(docId, {
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
          <button
            className="code-editor-action-btn"
            onClick={handleAIReview}
            onMouseDown={e => e.stopPropagation()}
            title="AI Review"
            disabled={!code.trim() || isReviewing}
          >
            {isReviewing ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
          </button>
        </div>
        <button className="code-editor-close-btn" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      <div className="code-editor-body" key={themeKey} onClick={() => {
        const editor = panelRef.current?.querySelector('.cm-content')
        if (editor) (editor as HTMLElement).focus()
      }}>
        <CodeMirror
          value={code}
          onChange={handleCodeChange}
          extensions={[getLangExtension(language)]}
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
          }}
        />
      </div>

      <div className="code-editor-resize-handle" onPointerDown={onResizePointerDown} />
    </div>
  )
}

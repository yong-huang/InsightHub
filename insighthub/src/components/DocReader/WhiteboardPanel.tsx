import { useState, useEffect, useRef, useCallback } from 'react'
import {
  GripVertical, X, Trash2, Sparkles, Loader2, Eye, EyeOff,
  Pen, Eraser, Type, Minus, Square, Circle, ArrowUpRight,
  Undo2, Redo2, Pencil, LayoutGrid, Download,
} from 'lucide-react'
import { analyzeWhiteboard } from '@/services/whiteboardService'
import { useDocumentStore } from '@/stores/documentStore'

type Tool = 'pen' | 'eraser' | 'text' | 'line' | 'rect' | 'circle' | 'arrow'

interface Point {
  x: number
  y: number
}

interface Stroke {
  tool: Tool
  points: Point[]
  color: string
  width: number
  text?: string
}

interface WhiteboardData {
  strokes: Stroke[]
  tool: Tool
  color: string
  width: number
  position: { x: number; y: number }
  size: { width: number; height: number }
}

const STORAGE_KEY = 'insighthub:whiteboard'
const DEFAULT_SIZE = { width: 600, height: 480 }
const MIN_W = 320
const MIN_H = 240

const PRESET_COLORS = [
  '#1a1a1a', '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71',
  '#3498db', '#9b59b6', '#1abc9c', '#e91e63', '#795548',
]

const TOOLS: { tool: Tool; icon: typeof Pen; label: string }[] = [
  { tool: 'pen', icon: Pen, label: 'Pen' },
  { tool: 'eraser', icon: Eraser, label: 'Eraser' },
  { tool: 'text', icon: Type, label: 'Text' },
  { tool: 'line', icon: Minus, label: 'Line' },
  { tool: 'rect', icon: Square, label: 'Rectangle' },
  { tool: 'circle', icon: Circle, label: 'Circle' },
  { tool: 'arrow', icon: ArrowUpRight, label: 'Arrow' },
]

function loadWhiteboardData(docId: string): WhiteboardData | null {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return all[docId] || null
  } catch {
    return null
  }
}

function saveWhiteboardData(docId: string, data: Partial<WhiteboardData>) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    all[docId] = { ...all[docId], ...data }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch { /* quota exceeded */ }
}

function getCanvasCoords(canvas: HTMLCanvasElement, e: PointerEvent): Point {
  const rect = canvas.getBoundingClientRect()
  // Context is already scaled by dpr, so use CSS pixel coords directly
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  }
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (stroke.points.length === 0) return
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = stroke.color
  ctx.fillStyle = stroke.color
  ctx.lineWidth = stroke.width

  switch (stroke.tool) {
    case 'pen': {
      ctx.beginPath()
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
      }
      ctx.stroke()
      break
    }
    case 'eraser': {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
      }
      ctx.stroke()
      break
    }
    case 'text': {
      if (stroke.text && stroke.points.length >= 1) {
        ctx.font = `${stroke.width * 5}px sans-serif`
        ctx.fillText(stroke.text, stroke.points[0].x, stroke.points[0].y)
      }
      break
    }
    case 'line': {
      if (stroke.points.length >= 2) {
        const [a, b] = [stroke.points[0], stroke.points[stroke.points.length - 1]]
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
      break
    }
    case 'rect': {
      if (stroke.points.length >= 2) {
        const [a, b] = [stroke.points[0], stroke.points[stroke.points.length - 1]]
        ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y)
      }
      break
    }
    case 'circle': {
      if (stroke.points.length >= 2) {
        const [a, b] = [stroke.points[0], stroke.points[stroke.points.length - 1]]
        const rx = Math.abs(b.x - a.x) / 2
        const ry = Math.abs(b.y - a.y) / 2
        const cx = (a.x + b.x) / 2
        const cy = (a.y + b.y) / 2
        ctx.beginPath()
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      break
    }
    case 'arrow': {
      if (stroke.points.length >= 2) {
        const [a, b] = [stroke.points[0], stroke.points[stroke.points.length - 1]]
        const angle = Math.atan2(b.y - a.y, b.x - a.x)
        const headLen = Math.max(12, stroke.width * 4)
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
        // arrowhead
        ctx.beginPath()
        ctx.moveTo(b.x, b.y)
        ctx.lineTo(b.x - headLen * Math.cos(angle - Math.PI / 6), b.y - headLen * Math.sin(angle - Math.PI / 6))
        ctx.moveTo(b.x, b.y)
        ctx.lineTo(b.x - headLen * Math.cos(angle + Math.PI / 6), b.y - headLen * Math.sin(angle + Math.PI / 6))
        ctx.stroke()
      }
      break
    }
  }
  ctx.restore()
}

const GRID_SIZE = 20

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save()
  ctx.strokeStyle = 'rgba(128, 128, 128, 0.15)'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  for (let x = GRID_SIZE; x < w; x += GRID_SIZE) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h)
  }
  for (let y = GRID_SIZE; y < h; y += GRID_SIZE) {
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
  }
  ctx.stroke()
  ctx.restore()
}

function redrawCanvas(canvas: HTMLCanvasElement, strokes: Stroke[], showGrid = false) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  // Use logical (CSS) coords since context is scaled by dpr
  const w = canvas.width / dpr
  const h = canvas.height / dpr
  ctx.clearRect(0, 0, w, h)
  if (showGrid) drawGrid(ctx, w, h)
  for (const stroke of strokes) {
    drawStroke(ctx, stroke)
  }
}

interface WhiteboardPanelProps {
  docId: string
  onClose: () => void
}

export function WhiteboardPanel({ docId, onClose }: WhiteboardPanelProps) {
  const saved = useRef(loadWhiteboardData(docId))
  const [strokes, setStrokes] = useState<Stroke[]>(saved.current?.strokes ?? [])
  const [redoStack, setRedoStack] = useState<Stroke[]>([])
  const [currentTool, setCurrentTool] = useState<Tool>(saved.current?.tool ?? 'pen')
  const [color, setColor] = useState(saved.current?.color ?? '#1a1a1a')
  const [strokeWidth, setStrokeWidth] = useState(saved.current?.width ?? 2)
  const [isTranslucent, setIsTranslucent] = useState(true)
  const [showGrid, setShowGrid] = useState(false)
  const showGridRef = useRef(false)
  const [aiFeedback, setAiFeedback] = useState('')
  const [showFeedback, setShowFeedback] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [interviewMode, setInterviewMode] = useState(false)

  const panelRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasWrapRef = useRef<HTMLDivElement>(null)
  const feedbackRef = useRef<HTMLDivElement>(null)
  const drawingRef = useRef(false)
  const currentStrokeRef = useRef<Stroke | null>(null)
  const strokesRef = useRef(strokes)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const aiAbortRef = useRef<AbortController | null>(null)
  const isAnalyzingRef = useRef(false)

  // Keep strokesRef in sync for use in pointer event callbacks
  strokesRef.current = strokes
  showGridRef.current = showGrid

  // Set initial position/size
  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    const pos = saved.current?.position ?? {
      x: Math.max(40, window.innerWidth - DEFAULT_SIZE.width - 40),
      y: 120,
    }
    const size = saved.current?.size ?? DEFAULT_SIZE
    el.style.left = `${pos.x}px`
    el.style.top = `${pos.y}px`
    el.style.width = `${size.width}px`
    el.style.height = `${size.height}px`
  }, [])

  // Resize canvas to match container
  useEffect(() => {
    const wrap = canvasWrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return

    const observer = new ResizeObserver(() => {
      const rect = wrap.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.scale(dpr, dpr)
      redrawCanvas(canvas, strokesRef.current, showGridRef.current)
    })
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

  // Redraw when strokes change (from undo/redo/clear)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    redrawCanvas(canvas, strokes, showGridRef.current)
  }, [strokes])

  // Auto-scroll AI feedback
  useEffect(() => {
    if (feedbackRef.current) {
      feedbackRef.current.scrollTop = feedbackRef.current.scrollHeight
    }
  }, [aiFeedback])

  // Cleanup
  useEffect(() => {
    return () => {
      clearTimeout(saveTimerRef.current)
      aiAbortRef.current?.abort()
    }
  }, [])

  // Debounced save
  const debouncedSave = useCallback((data: Partial<WhiteboardData>) => {
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveWhiteboardData(docId, data), 500)
  }, [docId])

  const updateStrokes = useCallback((newStrokes: Stroke[], newRedo?: Stroke[]) => {
    setStrokes(newStrokes)
    if (newRedo !== undefined) setRedoStack(newRedo)
    debouncedSave({ strokes: newStrokes })
  }, [debouncedSave])

  // Pointer events for drawing
  const handlePointerDown = useCallback((e: PointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(e.pointerId)
    drawingRef.current = true
    const pt = getCanvasCoords(canvas, e)

    if (currentTool === 'text') {
      // Inline text input: create a temporary input at click position
      const wrap = canvasWrapRef.current
      if (!wrap) return
      const rect = canvas.getBoundingClientRect()
      const input = document.createElement('input')
      input.type = 'text'
      input.className = 'wb-text-input'
      input.style.position = 'absolute'
      input.style.left = `${e.clientX - rect.left}px`
      input.style.top = `${e.clientY - rect.top - 12}px`
      input.style.fontSize = `${strokeWidth * 5}px`
      input.style.color = color
      input.style.background = 'transparent'
      input.style.border = '1px dashed var(--border-default)'
      input.style.outline = 'none'
      input.style.padding = '2px 4px'
      input.style.zIndex = '10'
      input.style.minWidth = '60px'
      wrap.appendChild(input)
      input.focus()

      const finish = () => {
        const text = input.value.trim()
        wrap.removeChild(input)
        if (text) {
          const stroke: Stroke = { tool: 'text', points: [pt], color, width: strokeWidth, text }
          updateStrokes([...strokesRef.current, stroke], [])
        }
        drawingRef.current = false
      }

      input.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') finish()
        if (ke.key === 'Escape') { wrap.removeChild(input); drawingRef.current = false }
      })
      input.addEventListener('blur', finish)
      return
    }

    const stroke: Stroke = {
      tool: currentTool,
      points: [pt],
      color: currentTool === 'eraser' ? '#000' : color,
      width: currentTool === 'eraser' ? strokeWidth * 3 : strokeWidth,
    }
    currentStrokeRef.current = stroke
  }, [currentTool, color, strokeWidth, updateStrokes])

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!drawingRef.current || !currentStrokeRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const pt = getCanvasCoords(canvas, e)
    currentStrokeRef.current.points.push(pt)

    // Redraw with current stroke preview
    redrawCanvas(canvas, [...strokesRef.current, currentStrokeRef.current], showGridRef.current)
  }, [])

  const handlePointerUp = useCallback((e: PointerEvent) => {
    if (!drawingRef.current) return
    drawingRef.current = false
    canvasRef.current?.releasePointerCapture(e.pointerId)
    const stroke = currentStrokeRef.current
    currentStrokeRef.current = null
    if (stroke && stroke.points.length >= 1) {
      updateStrokes([...strokesRef.current, stroke], [])
    }
  }, [updateStrokes])

  // Attach pointer events to canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerup', handlePointerUp)
    canvas.addEventListener('lostpointercapture', handlePointerUp)
    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerup', handlePointerUp)
      canvas.removeEventListener('lostpointercapture', handlePointerUp)
    }
  }, [handlePointerDown, handlePointerMove, handlePointerUp])

  const handleUndo = useCallback(() => {
    if (strokes.length === 0) return
    const last = strokes[strokes.length - 1]
    updateStrokes(strokes.slice(0, -1), [...redoStack, last])
  }, [strokes, redoStack, updateStrokes])

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return
    const last = redoStack[redoStack.length - 1]
    updateStrokes([...strokes, last], redoStack.slice(0, -1))
  }, [strokes, redoStack, updateStrokes])

  const handleClear = useCallback(() => {
    if (strokes.length === 0) return
    updateStrokes([], [])
  }, [strokes, updateStrokes])

  const handleToolChange = useCallback((tool: Tool) => {
    setCurrentTool(tool)
    saveWhiteboardData(docId, { tool })
  }, [docId])

  const handleColorChange = useCallback((c: string) => {
    setColor(c)
    saveWhiteboardData(docId, { color: c })
  }, [docId])

  const handleWidthChange = useCallback((w: number) => {
    setStrokeWidth(w)
    saveWhiteboardData(docId, { width: w })
  }, [docId])

  const handleExport = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `whiteboard-${docId}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 'image/png')
  }, [docId])

  const handleAIAnalyze = useCallback(async () => {
    if (isAnalyzingRef.current || strokes.length === 0) return
    const canvas = canvasRef.current
    if (!canvas) return

    aiAbortRef.current?.abort()
    const controller = new AbortController()
    aiAbortRef.current = controller
    isAnalyzingRef.current = true

    setIsAnalyzing(true)
    setAiFeedback('')
    setShowFeedback(true)

    try {
      // Get doc context
      const doc = await useDocumentStore.getState().ensureContentText(docId)
      const docContext = doc?.contentText?.slice(0, 2000) || ''

      const dataUrl = canvas.toDataURL('image/png')
      const mode = interviewMode ? 'interview' : 'analyze'
      await analyzeWhiteboard(dataUrl, mode, docContext, setAiFeedback, controller.signal)
    } catch {
      if (!controller.signal.aborted) setAiFeedback('Analysis failed. Please try again.')
    } finally {
      if (aiAbortRef.current === controller) {
        isAnalyzingRef.current = false
        setIsAnalyzing(false)
      }
    }
  }, [strokes, interviewMode, docId])

  // Drag via pointer capture (same pattern as CodeEditorPanel)
  const onTitleBarPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select, .wb-color-dot')) return
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
      saveWhiteboardData(docId, {
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

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault()
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      let newL = startRect.left, newT = startRect.top
      let newW = startRect.width, newH = startRect.height
      if (direction.includes('e')) newW = startRect.width + dx
      if (direction.includes('w')) { newW = startRect.width - dx; newL = startRect.left + dx }
      if (direction.includes('s')) newH = startRect.height + dy
      if (direction.includes('n')) { newH = startRect.height - dy; newT = startRect.top + dy }
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
      saveWhiteboardData(docId, {
        position: { x: parseFloat(el.style.left), y: parseFloat(el.style.top) },
        size: { width: el.offsetWidth, height: el.offsetHeight },
      })
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('lostpointercapture', lost)
  }, [docId])

  const getCursorClass = () => {
    switch (currentTool) {
      case 'eraser': return 'wb-cursor-eraser'
      case 'text': return 'wb-cursor-text'
      default: return 'wb-cursor-crosshair'
    }
  }

  return (
    <div
      ref={panelRef}
      className={`whiteboard-panel${isTranslucent ? ' translucent' : ''}`}
    >
      <div className="code-editor-titlebar" onPointerDown={onTitleBarPointerDown}>
        <GripVertical size={14} className="code-editor-grip" />
        <span className="code-editor-title">Whiteboard</span>

        {/* Tools */}
        <div style={{ display: 'flex', gap: '1px', marginLeft: 4 }}>
          {TOOLS.map(({ tool, icon: Icon, label }) => (
            <button
              key={tool}
              className={`code-editor-action-btn${currentTool === tool ? ' active' : ''}`}
              onClick={() => handleToolChange(tool)}
              onMouseDown={e => e.stopPropagation()}
              title={label}
            >
              <Icon size={13} />
            </button>
          ))}
        </div>

        {/* Colors */}
        <div style={{ display: 'flex', gap: 2, marginLeft: 6, alignItems: 'center' }}>
          {PRESET_COLORS.map(c => (
            <div
              key={c}
              className={`wb-color-dot${color === c ? ' active' : ''}`}
              style={{ background: c }}
              onClick={(e) => { e.stopPropagation(); handleColorChange(c) }}
              onMouseDown={e => e.stopPropagation()}
              title={c}
            />
          ))}
        </div>

        {/* Width slider */}
        <input
          type="range"
          min="1"
          max="12"
          value={strokeWidth}
          onChange={e => handleWidthChange(Number(e.target.value))}
          onMouseDown={e => e.stopPropagation()}
          className="wb-width-slider"
          title={`Width: ${strokeWidth}px`}
        />

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '2px', marginLeft: 'auto' }}>
          <button
            className={`code-editor-action-btn${interviewMode ? ' active' : ''}`}
            onClick={() => setInterviewMode(v => !v)}
            onMouseDown={e => e.stopPropagation()}
            title={interviewMode ? 'Analyze Mode' : 'Interview Mode'}
          >
            <Sparkles size={13} />
          </button>
          <button
            className="code-editor-action-btn"
            onClick={handleAIAnalyze}
            onMouseDown={e => e.stopPropagation()}
            title={interviewMode ? 'AI Interview' : 'AI Analyze'}
            disabled={isAnalyzing || strokes.length === 0}
          >
            {isAnalyzing ? <Loader2 size={13} className="spin" /> : <Pencil size={13} />}
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
            onClick={handleUndo}
            onMouseDown={e => e.stopPropagation()}
            title="Undo"
            disabled={strokes.length === 0}
          >
            <Undo2 size={13} />
          </button>
          <button
            className="code-editor-action-btn"
            onClick={handleRedo}
            onMouseDown={e => e.stopPropagation()}
            title="Redo"
            disabled={redoStack.length === 0}
          >
            <Redo2 size={13} />
          </button>
          <button
            className="code-editor-action-btn"
            onClick={handleClear}
            onMouseDown={e => e.stopPropagation()}
            title="Clear"
            disabled={strokes.length === 0}
          >
            <Trash2 size={13} />
          </button>
          <button
            className={`code-editor-action-btn${showGrid ? ' active' : ''}`}
            onClick={() => setShowGrid(v => !v)}
            onMouseDown={e => e.stopPropagation()}
            title="Grid"
          >
            <LayoutGrid size={13} />
          </button>
          <button
            className="code-editor-action-btn"
            onClick={handleExport}
            onMouseDown={e => e.stopPropagation()}
            title="Export PNG"
          >
            <Download size={13} />
          </button>
        </div>
        <button className="code-editor-close-btn" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      {/* Canvas area */}
      <div ref={canvasWrapRef} className={`whiteboard-canvas-wrap ${getCursorClass()}${showGrid ? ' show-grid' : ''}`}>
        <canvas ref={canvasRef} />
      </div>

      {/* AI feedback area */}
      {showFeedback && (
        <div className="wb-ai-feedback">
          <div className="wb-ai-feedback-header">
            <Sparkles size={13} />
            <span>{interviewMode ? 'Interview' : 'Analysis'}</span>
            {isAnalyzing && <Loader2 size={12} className="spin" />}
            <button
              className="code-editor-action-btn"
              onClick={() => setShowFeedback(false)}
              onMouseDown={e => e.stopPropagation()}
              title="Close"
            >
              <X size={12} />
            </button>
          </div>
          <div className="wb-ai-feedback-body" ref={feedbackRef}>
            {aiFeedback || (isAnalyzing ? 'Analyzing whiteboard...' : 'Click the analyze button to get AI feedback on your whiteboard content.')}
          </div>
        </div>
      )}

      {/* Resize handles */}
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

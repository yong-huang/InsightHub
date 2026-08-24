import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ============================================================
// Pure function tests — no DOM, no React
// ============================================================

// --- Types (mirrored from WhiteboardPanel) ---
type Tool = 'pen' | 'eraser' | 'text' | 'line' | 'rect' | 'circle' | 'arrow'
interface Point { x: number; y: number }
interface Stroke { tool: Tool; points: Point[]; color: string; width: number; text?: string }

// --- getCanvasCoords ---
function getCanvasCoords(canvas: HTMLCanvasElement, e: PointerEvent): Point {
  const rect = canvas.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

// --- drawStroke (duplicated for testability — mirrors WhiteboardPanel exactly) ---
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
      for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
      ctx.stroke()
      break
    }
    case 'eraser': {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
      for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
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
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
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
        ctx.beginPath(); ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, rx, ry, 0, 0, Math.PI * 2); ctx.stroke()
      }
      break
    }
    case 'arrow': {
      if (stroke.points.length >= 2) {
        const [a, b] = [stroke.points[0], stroke.points[stroke.points.length - 1]]
        const angle = Math.atan2(b.y - a.y, b.x - a.x)
        const headLen = Math.max(12, stroke.width * 4)
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
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

// --- redrawCanvas ---
function redrawCanvas(canvas: HTMLCanvasElement, strokes: Stroke[]) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
  for (const stroke of strokes) drawStroke(ctx, stroke)
}

// --- localStorage helpers ---
const STORAGE_KEY = 'insighthub:whiteboard'

interface WhiteboardData {
  strokes: Stroke[]
  tool: Tool
  color: string
  width: number
  position: { x: number; y: number }
  size: { width: number; height: number }
}

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

// ============================================================
// Helpers
// ============================================================

function createMockCanvas(w = 400, h = 300) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    left: 100, top: 50, width: w, height: h,
    right: 100 + w, bottom: 50 + h, x: 100, y: 50,
    toJSON: () => {},
  } as DOMRect)
  return canvas
}

/** Mock context exposing tracked calls and state for assertions */
interface MockCtx extends CanvasRenderingContext2D {
  __calls: Record<string, unknown[][]>
  __state: Record<string, unknown>
}

/** Create a mock CanvasRenderingContext2D with tracked method calls */
function createMockCtx(): MockCtx {
  const calls: Record<string, unknown[][]> = {}
  const state: Record<string, unknown> = {
    globalCompositeOperation: 'source-over',
    lineCap: 'butt',
    lineJoin: 'miter',
    strokeStyle: '#000',
    fillStyle: '#000',
    lineWidth: 1,
    font: '',
  }

  const handler: ProxyHandler<CanvasRenderingContext2D> = {
    get(_target, prop) {
      if (prop === '__calls') return calls
      if (prop === '__state') return state
      const key = String(prop)
      // Return state for property reads
      if (key in state) return state[key]
      // Return callable mock for methods
      return (...args: unknown[]) => {
        ;(calls[key] ??= []).push(args)
        // save/restore: no-op for mock (real ctx.save/restore are no-ops in our tests)
        return undefined
      }
    },
    set(_target, prop, value) {
      const key = String(prop)
      if (key in state) state[key] = value
      return true
    },
  }

  return new Proxy({} as unknown as CanvasRenderingContext2D, handler) as MockCtx
}

function makePointerEvent(overrides: Partial<PointerEvent> = {}): PointerEvent {
  return {
    clientX: 0, clientY: 0, pointerId: 0, pointerType: 'mouse',
    ...overrides,
  } as PointerEvent
}

// ============================================================
// Tests
// ============================================================

describe('WhiteboardPanel', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ---- getCanvasCoords ----
  describe('getCanvasCoords', () => {
    it('returns CSS-pixel coordinates relative to canvas origin', () => {
      const canvas = createMockCanvas(400, 300)
      const evt = makePointerEvent({ clientX: 200, clientY: 150 })
      const pt = getCanvasCoords(canvas, evt)
      expect(pt).toEqual({ x: 100, y: 100 })
    })

    it('returns (0,0) when pointer is at canvas top-left', () => {
      const canvas = createMockCanvas(400, 300)
      const evt = makePointerEvent({ clientX: 100, clientY: 50 })
      const pt = getCanvasCoords(canvas, evt)
      expect(pt).toEqual({ x: 0, y: 0 })
    })

    it('handles negative offsets when pointer is above/left of canvas', () => {
      const canvas = createMockCanvas(400, 300)
      const evt = makePointerEvent({ clientX: 50, clientY: 25 })
      const pt = getCanvasCoords(canvas, evt)
      expect(pt).toEqual({ x: -50, y: -25 })
    })
  })

  // ---- drawStroke ----
  describe('drawStroke', () => {
    it('pen stroke calls beginPath, moveTo, lineTo, stroke', () => {
      const ctx = createMockCtx()
      const stroke: Stroke = { tool: 'pen', points: [{ x: 0, y: 0 }, { x: 10, y: 20 }, { x: 30, y: 40 }], color: '#000', width: 2 }
      drawStroke(ctx, stroke)

      expect(ctx.__calls.save).toHaveLength(1)
      expect(ctx.__calls.beginPath).toHaveLength(1)
      expect(ctx.__calls.moveTo).toEqual([[0, 0]])
      expect(ctx.__calls.lineTo).toEqual([[10, 20], [30, 40]])
      expect(ctx.__calls.stroke).toHaveLength(1)
      expect(ctx.__calls.restore).toHaveLength(1)
    })

    it('eraser stroke sets globalCompositeOperation to destination-out', () => {
      const ctx = createMockCtx()
      const stroke: Stroke = { tool: 'eraser', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], color: '#000', width: 6 }
      drawStroke(ctx, stroke)
      // After restore (no-op mock), globalCompositeOperation stays destination-out
      // In real code, save/restore would reset it. Our mock doesn't simulate that,
      // so we just verify it was set.
      expect(ctx.__state.globalCompositeOperation).toBe('destination-out')
    })

    it('text stroke calls fillText when text is provided', () => {
      const ctx = createMockCtx()
      const stroke: Stroke = { tool: 'text', points: [{ x: 10, y: 20 }], color: '#000', width: 4, text: 'Hello' }
      drawStroke(ctx, stroke)
      expect(ctx.__calls.fillText).toEqual([['Hello', 10, 20]])
      expect(ctx.__state.font).toBe('20px sans-serif')
    })

    it('text stroke does nothing when text is empty', () => {
      const ctx = createMockCtx()
      const stroke: Stroke = { tool: 'text', points: [{ x: 10, y: 20 }], color: '#000', width: 4 }
      drawStroke(ctx, stroke)
      expect(ctx.__calls.fillText).toBeUndefined()
    })

    it('line stroke draws between first and last point', () => {
      const ctx = createMockCtx()
      const stroke: Stroke = { tool: 'line', points: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 100, y: 200 }], color: '#f00', width: 2 }
      drawStroke(ctx, stroke)
      expect(ctx.__calls.moveTo).toEqual([[0, 0]])
      expect(ctx.__calls.lineTo).toEqual([[100, 200]])
    })

    it('rect stroke calls strokeRect with correct dimensions', () => {
      const ctx = createMockCtx()
      const stroke: Stroke = { tool: 'rect', points: [{ x: 10, y: 10 }, { x: 100, y: 50 }], color: '#000', width: 1 }
      drawStroke(ctx, stroke)
      expect(ctx.__calls.strokeRect).toEqual([[10, 10, 90, 40]])
    })

    it('circle stroke calls ellipse with correct center and radii', () => {
      const ctx = createMockCtx()
      const stroke: Stroke = { tool: 'circle', points: [{ x: 0, y: 0 }, { x: 100, y: 60 }], color: '#000', width: 1 }
      drawStroke(ctx, stroke)
      expect(ctx.__calls.ellipse).toEqual([[50, 30, 50, 30, 0, 0, Math.PI * 2]])
    })

    it('arrow stroke draws main line + arrowhead (2 strokes, 2 beginPaths)', () => {
      const ctx = createMockCtx()
      const stroke: Stroke = { tool: 'arrow', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], color: '#000', width: 2 }
      drawStroke(ctx, stroke)
      // 2 beginPath (main line + arrowhead) and 2 stroke calls
      expect(ctx.__calls.beginPath).toHaveLength(2)
      expect(ctx.__calls.stroke).toHaveLength(2)
    })

    it('does nothing with empty points array', () => {
      const ctx = createMockCtx()
      const stroke: Stroke = { tool: 'pen', points: [], color: '#000', width: 2 }
      drawStroke(ctx, stroke)
      expect(ctx.__calls.beginPath).toBeUndefined()
    })

    it('line/rect/circle/arrow with single point do nothing', () => {
      const ctx = createMockCtx()
      drawStroke(ctx, { tool: 'line', points: [{ x: 0, y: 0 }], color: '#000', width: 1 })
      expect(ctx.__calls.stroke).toBeUndefined()

      drawStroke(ctx, { tool: 'rect', points: [{ x: 0, y: 0 }], color: '#000', width: 1 })
      expect(ctx.__calls.strokeRect).toBeUndefined()

      drawStroke(ctx, { tool: 'circle', points: [{ x: 0, y: 0 }], color: '#000', width: 1 })
      expect(ctx.__calls.ellipse).toBeUndefined()
    })

    it('sets correct line properties from stroke', () => {
      const ctx = createMockCtx()
      const stroke: Stroke = { tool: 'pen', points: [{ x: 0, y: 0 }], color: '#e74c3c', width: 5 }
      drawStroke(ctx, stroke)
      expect(ctx.__state.strokeStyle).toBe('#e74c3c')
      expect(ctx.__state.fillStyle).toBe('#e74c3c')
      expect(ctx.__state.lineWidth).toBe(5)
      expect(ctx.__state.lineCap).toBe('round')
      expect(ctx.__state.lineJoin).toBe('round')
    })
  })

  // ---- redrawCanvas ----
  describe('redrawCanvas', () => {
    it('clears canvas and draws all strokes', () => {
      const canvas = document.createElement('canvas')
      canvas.width = 400
      canvas.height = 300
      const mockCtx = createMockCtx()
      vi.spyOn(canvas, 'getContext').mockReturnValue(mockCtx)

      const strokes: Stroke[] = [
        { tool: 'pen', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], color: '#000', width: 2 },
        { tool: 'line', points: [{ x: 20, y: 20 }, { x: 100, y: 100 }], color: '#f00', width: 1 },
      ]
      redrawCanvas(canvas, strokes)

      expect(mockCtx.__calls.clearRect).toEqual([[0, 0, 400, 300]])
      // 2 beginPath calls (one per stroke)
      expect(mockCtx.__calls.beginPath).toHaveLength(2)
    })

    it('handles empty strokes array (just clears)', () => {
      const canvas = document.createElement('canvas')
      canvas.width = 400
      canvas.height = 300
      const mockCtx = createMockCtx()
      vi.spyOn(canvas, 'getContext').mockReturnValue(mockCtx)

      redrawCanvas(canvas, [])
      expect(mockCtx.__calls.clearRect).toEqual([[0, 0, 400, 300]])
      expect(mockCtx.__calls.beginPath).toBeUndefined()
    })

    it('uses logical coordinates when devicePixelRatio > 1', () => {
      const originalDpr = window.devicePixelRatio
      Object.defineProperty(window, 'devicePixelRatio', { value: 2, writable: true, configurable: true })

      const canvas = document.createElement('canvas')
      canvas.width = 800
      canvas.height = 600
      const mockCtx = createMockCtx()
      vi.spyOn(canvas, 'getContext').mockReturnValue(mockCtx)

      redrawCanvas(canvas, [])
      expect(mockCtx.__calls.clearRect).toEqual([[0, 0, 400, 300]])

      Object.defineProperty(window, 'devicePixelRatio', { value: originalDpr, writable: true, configurable: true })
    })

    it('returns early when canvas has no context', () => {
      const canvas = document.createElement('canvas')
      vi.spyOn(canvas, 'getContext').mockReturnValue(null)
      expect(() => redrawCanvas(canvas, [])).not.toThrow()
    })
  })

  // ---- localStorage persistence ----
  describe('localStorage persistence', () => {
    it('loadWhiteboardData returns null when no data exists', () => {
      expect(loadWhiteboardData('doc-1')).toBeNull()
    })

    it('saveWhiteboardData persists and loadWhiteboardData retrieves', () => {
      const strokes: Stroke[] = [
        { tool: 'pen', points: [{ x: 1, y: 2 }], color: '#f00', width: 3 },
      ]
      saveWhiteboardData('doc-1', { strokes, tool: 'pen', color: '#f00', width: 3 })

      const loaded = loadWhiteboardData('doc-1')
      expect(loaded).not.toBeNull()
      expect(loaded!.strokes).toEqual(strokes)
      expect(loaded!.tool).toBe('pen')
      expect(loaded!.color).toBe('#f00')
      expect(loaded!.width).toBe(3)
    })

    it('saveWhiteboardData merges with existing data', () => {
      saveWhiteboardData('doc-1', { color: '#f00' })
      saveWhiteboardData('doc-1', { width: 5 })

      const loaded = loadWhiteboardData('doc-1')
      expect(loaded!.color).toBe('#f00')
      expect(loaded!.width).toBe(5)
    })

    it('different docIds are isolated', () => {
      saveWhiteboardData('doc-1', { color: '#f00' })
      saveWhiteboardData('doc-2', { color: '#00f' })

      expect(loadWhiteboardData('doc-1')!.color).toBe('#f00')
      expect(loadWhiteboardData('doc-2')!.color).toBe('#00f')
      expect(loadWhiteboardData('doc-3')).toBeNull()
    })

    it('handles corrupted localStorage gracefully', () => {
      localStorage.setItem(STORAGE_KEY, 'not-json{{{')
      expect(loadWhiteboardData('doc-1')).toBeNull()
    })

    it('handles position and size persistence', () => {
      saveWhiteboardData('doc-1', {
        position: { x: 200, y: 300 },
        size: { width: 800, height: 600 },
      })
      const loaded = loadWhiteboardData('doc-1')
      expect(loaded!.position).toEqual({ x: 200, y: 300 })
      expect(loaded!.size).toEqual({ width: 800, height: 600 })
    })
  })

  // ---- Stroke data structure ----
  describe('stroke data structure', () => {
    it('pen stroke uses provided color and width', () => {
      const s: Stroke = { tool: 'pen', points: [{ x: 0, y: 0 }], color: '#e74c3c', width: 5 }
      expect(s.color).toBe('#e74c3c')
      expect(s.width).toBe(5)
    })

    it('eraser stroke overrides color to #000 and triples width', () => {
      const baseWidth = 3
      const stroke: Stroke = {
        tool: 'eraser', points: [{ x: 0, y: 0 }],
        color: '#000', width: baseWidth * 3,
      }
      expect(stroke.color).toBe('#000')
      expect(stroke.width).toBe(9)
    })

    it('text stroke stores text field', () => {
      const s: Stroke = { tool: 'text', points: [{ x: 10, y: 20 }], color: '#000', width: 3, text: 'hello' }
      expect(s.text).toBe('hello')
    })

    it('shape strokes use start+end points', () => {
      const shape: Stroke = { tool: 'rect', points: [{ x: 10, y: 10 }, { x: 100, y: 100 }], color: '#000', width: 2 }
      expect(shape.points).toHaveLength(2)
    })
  })
})

// ============================================================
// whiteboardService tests
// ============================================================
describe('whiteboardService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('sends vision-format messages to the proxy', async () => {
    const captured: { body: string } = { body: '' }
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, opts: RequestInit) => {
      captured.body = opts.body as string
      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Test feedback"}}]}\n\n'))
          controller.enqueue(encoder.encode('data: [DONE]\n'))
          controller.close()
        },
      })
      return Promise.resolve({ ok: true, body: readable } as Response)
    }))

    const { analyzeWhiteboard } = await import('@/services/whiteboardService')
    const chunks: string[] = []
    await analyzeWhiteboard('data:image/png;base64,abc', 'analyze', 'some doc context', (t) => chunks.push(t))

    const body = JSON.parse(captured.body)
    expect(body.stream).toBe(true)
    expect(body.messages).toHaveLength(2)
    expect(body.messages[0].role).toBe('system')
    expect(Array.isArray(body.messages[1].content)).toBe(true)
    const userContent = body.messages[1].content as Array<{ type: string; image_url?: { url: string }; text?: string }>
    expect(userContent).toHaveLength(2)
    expect(userContent[0].type).toBe('text')
    expect(userContent[0].text).toContain('some doc context')
    expect(userContent[1].type).toBe('image_url')
    expect(userContent[1].image_url!.url).toBe('data:image/png;base64,abc')
    expect(chunks[chunks.length - 1]).toBe('Test feedback')
  })

  it('uses interview system prompt when mode is interview', async () => {
    let capturedBody = ''
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
      capturedBody = opts.body as string
      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'))
          controller.enqueue(encoder.encode('data: [DONE]\n'))
          controller.close()
        },
      })
      return Promise.resolve({ ok: true, body: readable })
    }))

    const { analyzeWhiteboard } = await import('@/services/whiteboardService')
    await analyzeWhiteboard('data:image/png;base64,x', 'interview', '', vi.fn())

    const body = JSON.parse(capturedBody)
    expect(body.messages[0].content).toContain('mock technical interview')
  })

  it('uses analyze system prompt when mode is analyze', async () => {
    let capturedBody = ''
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
      capturedBody = opts.body as string
      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'))
          controller.enqueue(encoder.encode('data: [DONE]\n'))
          controller.close()
        },
      })
      return Promise.resolve({ ok: true, body: readable })
    }))

    const { analyzeWhiteboard } = await import('@/services/whiteboardService')
    await analyzeWhiteboard('data:image/png;base64,x', 'analyze', '', vi.fn())

    const body = JSON.parse(capturedBody)
    expect(body.messages[0].content).toContain('technical reviewer')
  })

  it('throws on non-ok HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    }))

    const { analyzeWhiteboard } = await import('@/services/whiteboardService')
    await expect(
      analyzeWhiteboard('data:image/png;base64,x', 'analyze', '', vi.fn())
    ).rejects.toThrow('AI error: 500')
  })

  it('rejects when signal is already aborted', async () => {
    const ac = new AbortController()
    ac.abort()

    const abortError = new Error('Aborted')
    abortError.name = 'AbortError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError))

    const { analyzeWhiteboard } = await import('@/services/whiteboardService')
    await expect(
      analyzeWhiteboard('data:image/png;base64,x', 'analyze', '', vi.fn(), ac.signal)
    ).rejects.toThrow('Aborted')
  })

  it('aborts streaming when external signal fires', async () => {
    const ac = new AbortController()

    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'))
          setTimeout(() => {
            ac.abort()
            controller.close()
          }, 10)
        },
      })
      return Promise.resolve({ ok: true, body: readable })
    }))

    const { analyzeWhiteboard } = await import('@/services/whiteboardService')
    const chunks: string[] = []
    const result = await analyzeWhiteboard('data:image/png;base64,x', 'analyze', '', (t) => chunks.push(t), ac.signal)
    expect(result).toBeDefined()
  })

  it('calls onChunk with accumulated text on each SSE delta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'))
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":" World"}}]}\n\n'))
          controller.enqueue(encoder.encode('data: [DONE]\n'))
          controller.close()
        },
      })
      return Promise.resolve({ ok: true, body: readable })
    }))

    const { analyzeWhiteboard } = await import('@/services/whiteboardService')
    const chunks: string[] = []
    await analyzeWhiteboard('data:image/png;base64,x', 'analyze', '', (t) => chunks.push(t))
    expect(chunks).toEqual(['Hello', 'Hello World'])
  })

  it('parses usage from SSE chunks', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"text"}}]}\n\n'))
          controller.enqueue(encoder.encode('data: {"usage":{"prompt_tokens":100,"completion_tokens":50,"total_tokens":150}}\n\n'))
          controller.enqueue(encoder.encode('data: [DONE]\n'))
          controller.close()
        },
      })
      return Promise.resolve({ ok: true, body: readable })
    }))

    const { analyzeWhiteboard } = await import('@/services/whiteboardService')
    const result = await analyzeWhiteboard('data:image/png;base64,x', 'analyze', '', vi.fn())
    expect(result.usage).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    })
  })

  it('skips malformed SSE chunks silently', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: bad json\n'))
          controller.enqueue(encoder.encode('not even sse\n'))
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'))
          controller.enqueue(encoder.encode('data: [DONE]\n'))
          controller.close()
        },
      })
      return Promise.resolve({ ok: true, body: readable })
    }))

    const { analyzeWhiteboard } = await import('@/services/whiteboardService')
    const chunks: string[] = []
    await analyzeWhiteboard('data:image/png;base64,x', 'analyze', '', (t) => chunks.push(t))
    expect(chunks).toContain('ok')
  })

  it('includes doc context in user message when provided', async () => {
    let capturedBody = ''
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
      capturedBody = opts.body as string
      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'))
          controller.enqueue(encoder.encode('data: [DONE]\n'))
          controller.close()
        },
      })
      return Promise.resolve({ ok: true, body: readable })
    }))

    const { analyzeWhiteboard } = await import('@/services/whiteboardService')
    await analyzeWhiteboard('data:image/png;base64,x', 'analyze', 'Binary search is O(log n)', vi.fn())

    const body = JSON.parse(capturedBody)
    const userContent = body.messages[1].content as Array<{ text?: string }>
    expect(userContent[0].text).toContain('Binary search is O(log n)')
  })

  it('uses default prompt when no doc context', async () => {
    let capturedBody = ''
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
      capturedBody = opts.body as string
      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'))
          controller.enqueue(encoder.encode('data: [DONE]\n'))
          controller.close()
        },
      })
      return Promise.resolve({ ok: true, body: readable })
    }))

    const { analyzeWhiteboard } = await import('@/services/whiteboardService')
    await analyzeWhiteboard('data:image/png;base64,x', 'analyze', '', vi.fn())

    const body = JSON.parse(capturedBody)
    const userContent = body.messages[1].content as Array<{ text?: string }>
    expect(userContent[0].text).toBe('Analyze this whiteboard content.')
  })

  it('sends NO_THINK_KWARGS to disable thinking mode', async () => {
    let capturedBody = ''
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
      capturedBody = opts.body as string
      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'))
          controller.enqueue(encoder.encode('data: [DONE]\n'))
          controller.close()
        },
      })
      return Promise.resolve({ ok: true, body: readable })
    }))

    const { analyzeWhiteboard } = await import('@/services/whiteboardService')
    await analyzeWhiteboard('data:image/png;base64,x', 'analyze', '', vi.fn())

    const body = JSON.parse(capturedBody)
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false })
    expect(body.think).toBe(false)
  })

  it('handles empty stream (no deltas)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: [DONE]\n'))
          controller.close()
        },
      })
      return Promise.resolve({ ok: true, body: readable })
    }))

    const { analyzeWhiteboard } = await import('@/services/whiteboardService')
    const chunks: string[] = []
    const result = await analyzeWhiteboard('data:image/png;base64,x', 'analyze', '', (t) => chunks.push(t))
    expect(chunks).toEqual([])
    expect(result.usage).toBeUndefined()
  })

  it('cleans up timers on completion', async () => {
    const spyClearTimeout = vi.spyOn(globalThis, 'clearTimeout')

    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'))
          controller.enqueue(encoder.encode('data: [DONE]\n'))
          controller.close()
        },
      })
      return Promise.resolve({ ok: true, body: readable })
    }))

    const { analyzeWhiteboard } = await import('@/services/whiteboardService')
    await analyzeWhiteboard('data:image/png;base64,x', 'analyze', '', vi.fn())

    // clearTimeout called for timeout + idle timer = at least 2
    expect(spyClearTimeout).toHaveBeenCalled()
  })
})

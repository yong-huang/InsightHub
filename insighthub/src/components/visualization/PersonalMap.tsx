import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force'
import { buildPersonalMapData, type EngagementMetrics } from '@/utils/personalMapBuilder'
import { type GraphNode } from '@/utils/graphBuilder'
import type { Document, Tag, QuizAttempt, Annotation } from '@/types'

interface SimNode extends GraphNode {
  x: number
  y: number
  vx: number
  vy: number
  fx?: number | null
  fy?: number | null
  metrics?: EngagementMetrics
}

interface SimLink {
  source: SimNode | string
  target: SimNode | string
  type: string
}

interface Props {
  documents: Map<string, Document>
  tags: Tag[]
  quizHistory: QuizAttempt[]
  annotations: Annotation[]
  showDocuments?: boolean
  showTags?: boolean
}

const WIDTH = 1200
const HEIGHT = 600

type InteractionMode = 'idle' | 'pan' | 'drag-node' | 'dragged-node'

function getEventClientPos(e: React.MouseEvent | React.TouchEvent): { clientX: number; clientY: number } {
  if ('touches' in e) {
    const touch = e.touches[0] || (e as React.TouchEvent).changedTouches[0]
    return { clientX: touch.clientX, clientY: touch.clientY }
  }
  return { clientX: (e as React.MouseEvent).clientX, clientY: (e as React.MouseEvent).clientY }
}

function getScoreLabel(score: number): string {
  if (score < 0) return 'Not Tested'
  if (score >= 80) return 'Mastered'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Learning'
  return 'Needs Work'
}

export function PersonalMap({ documents, tags, quizHistory, annotations, showDocuments = true, showTags = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const simRef = useRef<any>(null)
  const navigate = useNavigate()
  const location = useLocation()

  const graphData = useMemo(
    () => buildPersonalMapData(documents, tags, quizHistory, annotations, { showDocuments, showTags }),
    [documents, tags, quizHistory, annotations, showDocuments, showTags],
  )

  // Build metrics map for tooltips
  const metricsMap = useMemo(() => {
    const map = new Map<string, EngagementMetrics>()
    if (!graphData.nodes.length) return map

    // For category nodes: aggregate from connected docs
    const catDocIds = new Map<string, string[]>()
    for (const node of graphData.nodes) {
      if (node.id === 'user:me') continue
      if (node.id.startsWith('doc:')) {
        const docId = node.data?.docId
        if (!docId) continue
        // Find its category from links
        for (const link of graphData.links) {
          const sid = typeof link.source === 'string' ? link.source : (link.source as SimNode).id
          const tid = typeof link.target === 'string' ? link.target : (link.target as SimNode).id
          if (sid === `doc:${docId}` && tid.startsWith('cat:')) {
            const catKey = tid.slice(4)
            if (!catDocIds.has(catKey)) catDocIds.set(catKey, [])
            catDocIds.get(catKey)!.push(docId)
          }
        }
      }
    }

    // Build per-doc metrics
    const docMap = new Map<string, EngagementMetrics>()
    for (const [docId, doc] of documents) {
      const annCount = annotations.filter(a => a.documentId === docId).length
      const docQuizzes = quizHistory.filter(q => q.documentId === docId)
      const bestScore = docQuizzes.length > 0
        ? Math.round(Math.max(...docQuizzes.map(q => (q.totalScore / q.maxScore) * 100)))
        : -1
      const activityTimes = [
        doc.lastReadAt || 0,
        ...annotations.filter(a => a.documentId === docId).map(a => a.createdAt),
        ...docQuizzes.map(q => q.completedAt),
      ].filter(t => t > 0)
      docMap.set(docId, {
        readCount: doc.readCount,
        annotationCount: annCount,
        quizAttempts: docQuizzes.length,
        bestQuizScore: bestScore,
        lastActivityAt: activityTimes.length > 0 ? Math.max(...activityTimes) : 0,
      })
    }

    // Map doc metrics to nodes
    for (const node of graphData.nodes) {
      if (node.id.startsWith('doc:') && node.data?.docId) {
        const m = docMap.get(node.data.docId)
        if (m) map.set(node.id, m)
      }
    }

    // Aggregate category metrics
    for (const [catKey, docIds] of catDocIds) {
      const agg: EngagementMetrics = { readCount: 0, annotationCount: 0, quizAttempts: 0, bestQuizScore: -1, lastActivityAt: 0 }
      const quizzedScores: number[] = []
      for (const docId of docIds) {
        const m = docMap.get(docId)
        if (!m) continue
        agg.readCount += m.readCount
        agg.annotationCount += m.annotationCount
        agg.quizAttempts += m.quizAttempts
        agg.lastActivityAt = Math.max(agg.lastActivityAt, m.lastActivityAt)
        if (m.bestQuizScore >= 0) quizzedScores.push(m.bestQuizScore)
      }
      if (quizzedScores.length > 0) {
        agg.bestQuizScore = Math.round(quizzedScores.reduce((a, b) => a + b, 0) / quizzedScores.length)
      }
      map.set(`cat:${catKey}`, agg)
    }

    return map
  }, [graphData, documents, annotations, quizHistory])

  const [simNodes, setSimNodes] = useState<SimNode[]>([])
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: GraphNode } | null>(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })

  const interactionRef = useRef<{
    mode: InteractionMode
    nodeId: string | null
    lastClientX: number
    lastClientY: number
    hasMoved: boolean
  }>({ mode: 'idle', nodeId: null, lastClientX: 0, lastClientY: 0, hasMoved: false })

  // Separate flag that survives the mouseup→click gap
  const didDragRef = useRef(false)

  // Run simulation
  useEffect(() => {
    if (graphData.nodes.length === 0) return

    const nodes: SimNode[] = graphData.nodes.map(n => {
      if (n.id === 'user:me') {
        return { ...n, x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0, fx: WIDTH / 2, fy: HEIGHT / 2 }
      }
      return {
        ...n,
        x: WIDTH / 2 + (Math.random() - 0.5) * 200,
        y: HEIGHT / 2 + (Math.random() - 0.5) * 200,
        vx: 0,
        vy: 0,
      }
    })

    const links: SimLink[] = graphData.links.map(l => ({ ...l }))

    const sim = forceSimulation<SimNode>(nodes)
      .force('link', forceLink<SimNode, SimLink>(links).id(d => d.id).distance(100))
      .force('charge', forceManyBody().strength(-300))
      .force('center', forceCenter(WIDTH / 2, HEIGHT / 2))
      .force('collide', forceCollide<SimNode>().radius(d => d.size + 4))

    let rafId = 0
    sim.on('tick', () => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        setSimNodes(nodes.map(n => ({ ...n })))
      })
    })

    simRef.current = sim

    return () => {
      sim.stop()
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [graphData])

  const connectedIds = useCallback((nodeId: string): Set<string> => {
    const ids = new Set<string>([nodeId])
    for (const link of graphData.links) {
      const sid = typeof link.source === 'string' ? link.source : (link.source as { id: string }).id
      const tid = typeof link.target === 'string' ? link.target : (link.target as { id: string }).id
      if (sid === nodeId) ids.add(tid)
      if (tid === nodeId) ids.add(sid)
    }
    return ids
  }, [graphData.links])

  const highlightedSet = hoveredNode ? connectedIds(hoveredNode) : null

  const transformRef = useRef(transform)
  useEffect(() => {
    transformRef.current = transform
  }, [transform])

  const pinchRef = useRef<{ dist: number; k: number } | null>(null)

  // Wheel zoom
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      const t = transformRef.current
      const newK = Math.min(4, Math.max(0.2, t.k * factor))
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      setTransform({
        x: mx - (mx - t.x) * (newK / t.k),
        y: my - (my - t.y) * (newK / t.k),
        k: newK,
      })
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  const handlePointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e && e.touches.length === 2) {
      e.preventDefault()
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      pinchRef.current = { dist: Math.sqrt(dx * dx + dy * dy), k: transformRef.current.k }
      interactionRef.current = { mode: 'idle', nodeId: null, lastClientX: 0, lastClientY: 0, hasMoved: false }
      return
    }
    if ('touches' in e && e.touches.length !== 1) return

    const { clientX, clientY } = getEventClientPos(e)
    const target = (e.target as Element)
    const nodeG = target.closest('[data-node-id]')
    if (nodeG) {
      const nodeId = nodeG.getAttribute('data-node-id')!
      interactionRef.current = {
        mode: 'drag-node',
        nodeId,
        lastClientX: clientX,
        lastClientY: clientY,
        hasMoved: false,
      }
      didDragRef.current = false
      const sim = simRef.current
      if (sim) {
        const node = sim.nodes().find((n: SimNode) => n.id === nodeId)
        if (node) {
          node.fx = node.x
          node.fy = node.y
        }
      }
    } else {
      interactionRef.current = {
        mode: 'pan',
        nodeId: null,
        lastClientX: clientX,
        lastClientY: clientY,
        hasMoved: false,
      }
      didDragRef.current = false
    }
  }, [])

  const handlePointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e && e.touches.length === 2 && pinchRef.current) {
      e.preventDefault()
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const scale = dist / pinchRef.current.dist
      const newK = Math.min(4, Math.max(0.2, pinchRef.current.k * scale))
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
      const t = transformRef.current
      setTransform({
        x: cx - (cx - t.x) * (newK / t.k),
        y: cy - (cy - t.y) * (newK / t.k),
        k: newK,
      })
      return
    }
    if ('touches' in e && e.touches.length !== 1) return

    const { clientX, clientY } = getEventClientPos(e)
    const state = interactionRef.current
    if (state.mode === 'pan') {
      state.hasMoved = true
      didDragRef.current = true
      const dx = clientX - state.lastClientX
      const dy = clientY - state.lastClientY
      state.lastClientX = clientX
      state.lastClientY = clientY
      setTransform(t => ({ ...t, x: t.x + dx, y: t.y + dy }))
    } else if (state.mode === 'drag-node' || state.mode === 'dragged-node') {
      state.hasMoved = true
      didDragRef.current = true
      state.mode = 'dragged-node'
      const dx = clientX - state.lastClientX
      const dy = clientY - state.lastClientY
      state.lastClientX = clientX
      state.lastClientY = clientY
      const sim = simRef.current
      if (sim && state.nodeId) {
        const node = sim.nodes().find((n: SimNode) => n.id === state.nodeId)
        if (node && node.fx != null) {
          const k = transformRef.current.k
          node.fx = node.fx + dx / k
          node.fy = node.fy + dy / k
          sim.alpha(0.3).restart()
        }
      }
    }
  }, [])

  const handlePointerUp = useCallback(() => {
    pinchRef.current = null
    const state = interactionRef.current
    if (state.mode === 'drag-node' || state.mode === 'dragged-node') {
      const sim = simRef.current
      if (sim && state.nodeId) {
        const node = sim.nodes().find((n: SimNode) => n.id === state.nodeId)
        if (node) {
          node.fx = null
          node.fy = null
        }
      }
    }
    interactionRef.current = { mode: 'idle', nodeId: null, lastClientX: 0, lastClientY: 0, hasMoved: false }
  }, [])

  const handleClick = useCallback((node: GraphNode) => {
    if (didDragRef.current) {
      didDragRef.current = false
      return
    }
    if (node.id === 'user:me') return
    if (node.type === 'document' && node.data?.docId) {
      navigate(`/doc/${node.data.docId}`, { state: { from: location.pathname } })
    } else if (node.type === 'category' && node.data?.categoryKey) {
      const source = node.data.categorySource
      if (source) {
        navigate(`/${source}/${node.data.categoryKey}`)
      }
    } else if (node.type === 'tag' && node.data?.tagId) {
      navigate(`/tag/${node.data.tagId}`)
    }
  }, [navigate, location.pathname])

  if (graphData.nodes.length === 0) {
    return (
      <div className="pm-empty">
        <div className="pm-empty-icon">🗺️</div>
        <p>No learning data yet</p>
        <p className="pm-empty-hint">Read documents, add annotations, or complete quizzes to see your personal knowledge map here</p>
      </div>
    )
  }

  const renderTooltipContent = (node: GraphNode) => {
    if (node.id === 'user:me') {
      return (
        <>
          <strong>Me</strong>
          <br />
          <span style={{ opacity: 0.7 }}>Learning Center</span>
        </>
      )
    }

    const metrics = metricsMap.get(node.id)
    const typeLabel = node.id.startsWith('cat:') ? 'Category' : node.id.startsWith('doc:') ? 'Document' : 'Tag'

    return (
      <>
        <strong>{node.label}</strong>
        <br />
        <span style={{ opacity: 0.7 }}>{typeLabel}</span>
        {metrics && (
          <>
            <br />
            <span>Read {metrics.readCount} times · {metrics.annotationCount} annotations · {metrics.quizAttempts} quizzes</span>
            {metrics.bestQuizScore >= 0 && (
              <>
                <br />
                <span>Best score: {metrics.bestQuizScore} pts ({getScoreLabel(metrics.bestQuizScore)})</span>
              </>
            )}
          </>
        )}
      </>
    )
  }

  return (
    <div
      ref={containerRef}
      className="pm-container"
      onMouseDown={handlePointerDown}
      onMouseMove={handlePointerMove}
      onMouseUp={handlePointerUp}
      onMouseLeave={() => {
        const state = interactionRef.current
        if (state.mode === 'drag-node' || state.mode === 'dragged-node') {
          const sim = simRef.current
          if (sim && state.nodeId) {
            const node = sim.nodes().find((n: SimNode) => n.id === state.nodeId)
            if (node) { node.fx = null; node.fy = null }
          }
        }
        if (state.hasMoved) didDragRef.current = true
        interactionRef.current = { mode: 'idle', nodeId: null, lastClientX: 0, lastClientY: 0, hasMoved: false }
      }}
      onTouchStart={handlePointerDown}
      onTouchMove={handlePointerMove}
      onTouchEnd={handlePointerUp}
      onTouchCancel={handlePointerUp}
    >
      <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
          {/* Links */}
          {graphData.links.map((link, i) => {
            const sid = typeof link.source === 'string' ? link.source : (link.source as { id: string }).id
            const tid = typeof link.target === 'string' ? link.target : (link.target as { id: string }).id
            const sn = simNodes.find(n => n.id === sid)
            const tn = simNodes.find(n => n.id === tid)
            if (!sn || !tn) return null

            let className = 'pm-link'
            if (highlightedSet) {
              className += highlightedSet.has(sid) && highlightedSet.has(tid) ? ' highlighted' : ' dimmed'
            }

            return (
              <line
                key={i}
                className={className}
                x1={sn.x} y1={sn.y}
                x2={tn.x} y2={tn.y}
              />
            )
          })}

          {/* Nodes */}
          {simNodes.map(node => {
            const isCenter = node.id === 'user:me'
            let className = isCenter ? 'pm-node pm-center-node' : 'pm-node'
            if (highlightedSet && !highlightedSet.has(node.id)) {
              className += ' dimmed'
            }

            const showLabel = isCenter ||
              node.type === 'category' ||
              (node.type === 'tag' && node.size > 10) ||
              transform.k > 1.2

            return (
              <g
                key={node.id}
                className={className}
                data-node-id={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onMouseEnter={(e) => {
                  if (interactionRef.current.mode === 'idle') {
                    setHoveredNode(node.id)
                    const rect = (e.currentTarget as Element).getBoundingClientRect()
                    setTooltip({ x: rect.left + rect.width / 2, y: rect.top - 4, node })
                  }
                }}
                onMouseLeave={() => {
                  setHoveredNode(null)
                  setTooltip(null)
                }}
                onTouchStart={(e) => {
                  if (interactionRef.current.mode === 'idle' && e.touches.length === 1) {
                    setHoveredNode(node.id)
                    const rect = (e.currentTarget as Element).getBoundingClientRect()
                    setTooltip({ x: rect.left + rect.width / 2, y: rect.top - 4, node })
                  }
                }}
                onTouchEnd={() => {
                  setTimeout(() => {
                    setHoveredNode(null)
                    setTooltip(null)
                  }, 1500)
                }}
                onClick={() => handleClick(node)}
              >
                {/* Center node ring */}
                {isCenter && (
                  <circle
                    r={node.size + 6}
                    fill="none"
                    stroke={node.color}
                    strokeWidth={1.5}
                    opacity={0.3}
                  />
                )}
                <circle
                  r={node.size}
                  fill={node.color}
                  stroke={highlightedSet?.has(node.id) ? '#fff' : 'transparent'}
                  strokeWidth={hoveredNode === node.id ? 2 : 0}
                />
                {isCenter && (
                  <text
                    className="pm-node-label pm-center-label"
                    y={1}
                    style={{ fill: '#fff', fontWeight: 700, fontSize: '14px' }}
                  >
                    Me
                  </text>
                )}
                {!isCenter && showLabel && (
                  <text
                    className="pm-node-label"
                    y={node.size + 14}
                    style={{ fontSize: node.type === 'category' ? '11px' : '10px' }}
                  >
                    {node.label}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>

      {/* Legend */}
      <div className="pm-legend">
        <div className="pm-legend-title">Mastery Level</div>
        <div className="pm-legend-item">
          <span className="pm-legend-dot" style={{ background: '#4ecdc4' }} />
          <span>Mastered (80-100)</span>
        </div>
        <div className="pm-legend-item">
          <span className="pm-legend-dot" style={{ background: '#fbbf24' }} />
          <span>Good (60-79)</span>
        </div>
        <div className="pm-legend-item">
          <span className="pm-legend-dot" style={{ background: '#ff8c42' }} />
          <span>Learning (40-59)</span>
        </div>
        <div className="pm-legend-item">
          <span className="pm-legend-dot" style={{ background: '#ff6b6b' }} />
          <span>Needs Work (0-39)</span>
        </div>
        <div className="pm-legend-item">
          <span className="pm-legend-dot" style={{ background: '#a78bfa' }} />
          <span>Not Tested</span>
        </div>
      </div>

      {/* Size legend */}
      <div className="pm-legend pm-size-legend">
        <div className="pm-legend-title">Node Size</div>
        <div className="pm-legend-item">
          <span>More engagement = larger node</span>
        </div>
        <div className="pm-legend-item">
          <span style={{ opacity: 0.7, fontSize: '11px' }}>Read x1 + Annotation x2 + Quiz x3</span>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pm-tooltip"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {renderTooltipContent(tooltip.node)}
        </div>
      )}
    </div>
  )
}

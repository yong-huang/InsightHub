import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force'
import { buildGraphData, type GraphNode, type GraphOptions } from '@/utils/graphBuilder'
import type { Document, Tag } from '@/types'

interface SimNode extends GraphNode {
  x: number
  y: number
  vx: number
  vy: number
  fx?: number | null
  fy?: number | null
}

interface SimLink {
  source: SimNode | string
  target: SimNode | string
  type: string
}

interface Props {
  documents: Map<string, Document>
  tags: Tag[]
  options?: GraphOptions
}

const WIDTH = 1200
const HEIGHT = 600

type InteractionMode = 'idle' | 'pan' | 'drag-node' | 'dragged-node'

export function KnowledgeGraph({ documents, tags, options: externalOptions }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const simRef = useRef<any>(null)
  const navigate = useNavigate()

  const graphData = useMemo(
    () => buildGraphData(documents, tags, externalOptions || { filterSource: 'all', showDocuments: true }),
    [documents, tags, externalOptions],
  )

  const [simNodes, setSimNodes] = useState<SimNode[]>([])
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: GraphNode } | null>(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })

  // Unified interaction state
  const interactionRef = useRef<{
    mode: InteractionMode
    nodeId: string | null
    lastClientX: number
    lastClientY: number
    hasMoved: boolean
  }>({ mode: 'idle', nodeId: null, lastClientX: 0, lastClientY: 0, hasMoved: false })

  // Run simulation
  useEffect(() => {
    if (graphData.nodes.length === 0) return

    const nodes: SimNode[] = graphData.nodes.map(n => ({
      ...n,
      x: WIDTH / 2 + (Math.random() - 0.5) * 200,
      y: HEIGHT / 2 + (Math.random() - 0.5) * 200,
      vx: 0,
      vy: 0,
    }))

    const links: SimLink[] = graphData.links.map(l => ({ ...l }))

    const sim = forceSimulation<SimNode>(nodes)
      .force('link', forceLink<SimNode, SimLink>(links).id(d => d.id).distance(80))
      .force('charge', forceManyBody().strength(-200))
      .force('center', forceCenter(WIDTH / 2, HEIGHT / 2))
      .force('collide', forceCollide<SimNode>().radius(d => d.size + 4))

    sim.on('tick', () => {
      setSimNodes(nodes.map(n => ({ ...n })))
    })

    simRef.current = sim

    return () => {
      sim.stop()
    }
  }, [graphData])

  // Build connected node ids for highlighting
  const connectedIds = useCallback((nodeId: string): Set<string> => {
    const ids = new Set<string>([nodeId])
    for (const link of graphData.links) {
      const sid = typeof link.source === 'string' ? link.source : link.source.id
      const tid = typeof link.target === 'string' ? link.target : link.target.id
      if (sid === nodeId) ids.add(tid)
      if (tid === nodeId) ids.add(sid)
    }
    return ids
  }, [graphData.links])

  const highlightedSet = hoveredNode ? connectedIds(hoveredNode) : null

  // Transform ref for wheel handler
  const transformRef = useRef(transform)
  useEffect(() => {
    transformRef.current = transform
  }, [transform])

  // Zoom via wheel — must use non-passive listener to preventDefault
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

  // Unified mouse handlers on container
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as Element
    const nodeG = target.closest('[data-node-id]')
    if (nodeG) {
      // Start dragging a node
      const nodeId = nodeG.getAttribute('data-node-id')!
      interactionRef.current = {
        mode: 'drag-node',
        nodeId,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
        hasMoved: false,
      }
      const sim = simRef.current
      if (sim) {
        const node = sim.nodes().find((n: SimNode) => n.id === nodeId)
        if (node) {
          node.fx = node.x
          node.fy = node.y
        }
      }
    } else {
      // Start panning
      interactionRef.current = {
        mode: 'pan',
        nodeId: null,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
        hasMoved: false,
      }
    }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const state = interactionRef.current
    if (state.mode === 'pan') {
      state.hasMoved = true
      const dx = e.clientX - state.lastClientX
      const dy = e.clientY - state.lastClientY
      state.lastClientX = e.clientX
      state.lastClientY = e.clientY
      setTransform(t => ({ ...t, x: t.x + dx, y: t.y + dy }))
    } else if (state.mode === 'drag-node' || state.mode === 'dragged-node') {
      state.hasMoved = true
      state.mode = 'dragged-node'
      const dx = e.clientX - state.lastClientX
      const dy = e.clientY - state.lastClientY
      state.lastClientX = e.clientX
      state.lastClientY = e.clientY
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

  const handleMouseUp = useCallback(() => {
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

  // Click to navigate (only if no drag movement)
  const handleClick = useCallback((node: GraphNode) => {
    if (interactionRef.current.hasMoved) return
    if (node.type === 'document' && node.data?.docId) {
      navigate(`/doc/${node.data.docId}`)
    } else if (node.type === 'category' && node.data?.categoryKey) {
      const cat = node.data.categoryKey
      const source = cat === 'mindinsight' || cat === 'techinsight' ? cat : ''
      if (source) {
        navigate(`/${source}`)
      }
    } else if (node.type === 'tag' && node.data?.tagId) {
      navigate(`/tag/${node.data.tagId}`)
    }
  }, [navigate])

  if (graphData.nodes.length === 0) {
    return <div className="stats-empty">暂无图数据，请先阅读一些文档</div>
  }

  return (
    <div
      ref={containerRef}
      className="kg-container"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        // Clean up on mouse leave
        const state = interactionRef.current
        if (state.mode === 'drag-node' || state.mode === 'dragged-node') {
          const sim = simRef.current
          if (sim && state.nodeId) {
            const node = sim.nodes().find((n: SimNode) => n.id === state.nodeId)
            if (node) { node.fx = null; node.fy = null }
          }
        }
        interactionRef.current = { mode: 'idle', nodeId: null, lastClientX: 0, lastClientY: 0, hasMoved: false }
      }}
    >
      <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
          {/* Links */}
          {graphData.links.map((link, i) => {
            const sid = typeof link.source === 'string' ? link.source : link.source.id
            const tid = typeof link.target === 'string' ? link.target : link.target.id
            const sn = simNodes.find(n => n.id === sid)
            const tn = simNodes.find(n => n.id === tid)
            if (!sn || !tn) return null

            let className = 'kg-link'
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
            let className = 'kg-node'
            if (highlightedSet && !highlightedSet.has(node.id)) {
              className += ' dimmed'
            }

            const showLabel = node.type === 'source' || node.type === 'category' ||
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
                onClick={() => handleClick(node)}
              >
                <circle
                  r={node.size}
                  fill={node.color}
                  stroke={highlightedSet?.has(node.id) ? '#fff' : 'transparent'}
                  strokeWidth={hoveredNode === node.id ? 2 : 0}
                />
                {showLabel && (
                  <text
                    className="kg-node-label"
                    y={node.size + 14}
                    style={{ fontSize: node.type === 'source' ? '13px' : '10px' }}
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
      <div className="kg-legend">
        {graphData.nodes.some(n => n.type === 'source') ? (
          graphData.nodes.filter(n => n.type === 'source').map(n => (
            <div key={n.id} className="kg-legend-item">
              <span className="kg-legend-dot" style={{ background: n.color }} />
              <span>{n.label}</span>
            </div>
          ))
        ) : (
          <div className="kg-legend-item">
            <span className="kg-legend-dot" style={{ background: externalOptions?.filterSource === 'mindinsight' ? '#ff8c42' : '#326ce5' }} />
            <span>{externalOptions?.filterSource === 'mindinsight' ? 'MindInsight' : 'TechInsight'}</span>
          </div>
        )}
        <div className="kg-legend-item">
          <span className="kg-legend-dot" style={{ background: '#fbbf24' }} />
          <span>分类</span>
        </div>
        <div className="kg-legend-item">
          <span className="kg-legend-dot" style={{ background: '#a78bfa', width: '8px', height: '8px', borderRadius: '50%' }} />
          <span>标签</span>
        </div>
        {externalOptions?.showDocuments !== false && (
          <div className="kg-legend-item">
            <span className="kg-legend-dot" style={{ background: 'rgba(50,108,229,0.6)', width: '6px', height: '6px', borderRadius: '50%' }} />
            <span>文档</span>
          </div>
        )}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="kg-tooltip"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <strong>{tooltip.node.label}</strong>
          <br />
          <span style={{ opacity: 0.7 }}>{tooltip.node.type === 'source' ? '来源' : tooltip.node.type === 'category' ? '分类' : tooltip.node.type === 'tag' ? '标签' : '文档'}</span>
        </div>
      )}
    </div>
  )
}

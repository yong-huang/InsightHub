import { useState, useRef, useCallback } from 'react'
import { ZoomIn, ZoomOut, Maximize, RotateCcw, ImageOff } from 'lucide-react'

interface ImageViewerProps {
  src: string
  title: string
}

export function ImageViewer({ src, title }: ImageViewerProps) {
  const [scale, setScale] = useState(1)
  const [loadError, setLoadError] = useState(false)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  const isZoomed = scale !== 1

  const handleZoomIn = useCallback(() => {
    setScale(s => Math.min(5, +(s * 1.25).toFixed(2)))
  }, [])

  const handleZoomOut = useCallback(() => {
    setScale(s => Math.max(0.25, +(s / 1.25).toFixed(2)))
  }, [])

  const handleReset = useCallback(() => {
    setScale(1)
    setTranslate({ x: 0, y: 0 })
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setScale(s => {
      const next = Math.min(5, Math.max(0.25, +(s * delta).toFixed(2)))
      if (next === 1) setTranslate({ x: 0, y: 0 })
      return next
    })
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isZoomed) return
    e.preventDefault()
    setIsDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY, tx: translate.x, ty: translate.y }
  }, [isZoomed, translate])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    setTranslate({ x: dragStart.current.tx + dx, y: dragStart.current.ty + dy })
  }, [isDragging])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  return (
    <div
      ref={containerRef}
      className="doc-reader-iframe image-viewer-container"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {loadError ? (
        <div className="image-viewer-error">
          <ImageOff size={48} />
          <p>Image not found</p>
          <p className="image-viewer-error-hint">The file may have been moved or deleted.</p>
        </div>
      ) : (
        <img
          src={src}
          alt={title}
          className={`image-viewer-img${isZoomed ? ' zoomed' : ''}`}
          draggable={false}
          onError={() => setLoadError(true)}
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          }}
        />
      )}

      <div className="image-viewer-toolbar">
        <button className="image-viewer-btn" onClick={handleZoomOut} title="Zoom Out">
          <ZoomOut size={16} />
        </button>
        <span className="image-viewer-zoom-label">{Math.round(scale * 100)}%</span>
        <button className="image-viewer-btn" onClick={handleZoomIn} title="Zoom In">
          <ZoomIn size={16} />
        </button>
        <button className="image-viewer-btn" onClick={handleReset} title="Fit to Screen">
          <RotateCcw size={16} />
        </button>
        <button className="image-viewer-btn" onClick={handleZoomIn} title="Actual Size">
          <Maximize size={16} />
        </button>
      </div>
    </div>
  )
}

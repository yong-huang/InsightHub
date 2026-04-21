import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Play, Trash2, Eye, EyeOff, GripVertical, Save,
} from 'lucide-react'
import { parseSections, type ParsedSection } from '@/utils/sectionParser'
import { usePresentationStore } from '@/stores/presentationStore'
import { useDocumentStore } from '@/stores/documentStore'
import type { Presentation } from '@/types'

export function PresentationEditorPage() {
  const { docId } = useParams<{ docId: string }>()
  const navigate = useNavigate()

  const [sections, setSections] = useState<ParsedSection[]>([])
  const [loading, setLoading] = useState(true)
  const [slideOrder, setSlideOrder] = useState<number[]>([])
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const [speakerNotes, setSpeakerNotes] = useState<Record<number, string>>({})
  const [editingNotesFor, setEditingNotesFor] = useState<number | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [saved, setSaved] = useState(false)

  const presentation = usePresentationStore(s => s.getByDocumentId(docId!))
  const doc = useDocumentStore(s => s.documents.get(docId!))

  useEffect(() => {
    if (!docId) return
    setLoading(true)
    parseSections(docId).then(parsed => {
      setSections(parsed)
      const allIndices = parsed.map((_, i) => i)

      if (presentation) {
        // Restore state from saved presentation
        const savedSet = new Set(allIndices)
        presentation.slideOrder.forEach(i => savedSet.delete(i))
        const excludedFromNotInOrder = Array.from(savedSet)
        // Any index not in slideOrder is excluded
        const excludedSet = new Set(allIndices.filter(i => !presentation.slideOrder.includes(i)))
        setSlideOrder([...presentation.slideOrder])
        setExcluded(excludedSet)
        setSpeakerNotes({ ...presentation.speakerNotes })
      } else {
        setSlideOrder(allIndices)
        setExcluded(new Set())
        setSpeakerNotes({})
      }
      setLoading(false)
    })
  }, [docId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = useCallback(() => {
    if (!docId) return
    const store = usePresentationStore.getState()
    const data: Presentation = {
      id: presentation?.id || `pres-${Date.now()}`,
      documentId: docId,
      documentTitle: doc?.title || '',
      slideOrder,
      speakerNotes,
      createdAt: presentation?.createdAt || Date.now(),
      updatedAt: Date.now(),
    }
    store.savePresentation(data)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [docId, slideOrder, speakerNotes, presentation, doc])

  // Drag and drop handlers
  const handleDragStart = useCallback((idx: number) => {
    setDragIdx(idx)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setDragOverIdx(idx)
  }, [])

  const handleDrop = useCallback((idx: number) => {
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null)
      setDragOverIdx(null)
      return
    }
    const newOrder = [...slideOrder]
    const [removed] = newOrder.splice(dragIdx, 1)
    newOrder.splice(idx, 0, removed)
    setSlideOrder(newOrder)
    setDragIdx(null)
    setDragOverIdx(null)
  }, [dragIdx, slideOrder])

  const handleDragEnd = useCallback(() => {
    setDragIdx(null)
    setDragOverIdx(null)
  }, [])

  const toggleExclude = useCallback((sectionIdx: number) => {
    setExcluded(prev => {
      const next = new Set(prev)
      if (next.has(sectionIdx)) {
        next.delete(sectionIdx)
        // Add back to slideOrder at the end
        if (!slideOrder.includes(sectionIdx)) {
          setSlideOrder(order => [...order, sectionIdx])
        }
      } else {
        next.add(sectionIdx)
        // Remove from slideOrder
        setSlideOrder(order => order.filter(i => i !== sectionIdx))
      }
      return next
    })
  }, [slideOrder])

  const updateNotes = useCallback((sectionIdx: number, text: string) => {
    setSpeakerNotes(prev => ({ ...prev, [sectionIdx]: text }))
  }, [])

  const handleDelete = useCallback(() => {
    if (!presentation) return
    if (!window.confirm('Delete this presentation?')) return
    usePresentationStore.getState().deletePresentation(presentation.id)
    navigate(-1)
  }, [presentation, navigate])

  const activeSlides = slideOrder.map(i => sections[i]).filter(Boolean)
  const excludedSlides = Array.from(excluded).map(i => sections[i]).filter(Boolean)

  if (loading) {
    return <div className="presentation-editor-page"><p>Loading...</p></div>
  }

  if (sections.length === 0) {
    return (
      <div className="presentation-editor-page">
        <p>This document has no sections to create slides from.</p>
        <Link to={doc ? `/${doc.source}` : '/'} className="btn btn-secondary">
          <ArrowLeft size={16} /> Back
        </Link>
      </div>
    )
  }

  return (
    <div className="presentation-editor-page">
      <div className="presentation-editor-header">
        <div>
          <h1>Edit Presentation</h1>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>
            {doc?.title || ''} — {activeSlides.length} slides, {excludedSlides.length} excluded
          </p>
        </div>
        <div className="presentation-editor-actions">
          {presentation && (
            <button className="btn btn-ghost btn-sm" onClick={handleDelete} style={{ color: 'var(--text-tertiary)' }}>
              <Trash2 size={14} /> Delete
            </button>
          )}
          <Link to={`/presentation/${docId}`} className="btn btn-primary btn-sm">
            <Play size={14} /> Present
          </Link>
          <button
            className={`btn btn-sm ${saved ? 'btn-primary' : 'btn-secondary'}`}
            onClick={handleSave}
          >
            <Save size={14} /> {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>

      {/* Included slides */}
      <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
        Active Slides ({activeSlides.length})
      </h3>
      <div className="presentation-editor-grid">
        {slideOrder.map((sectionIdx, orderIdx) => {
          const section = sections[sectionIdx]
          if (!section) return null

          return (
            <div
              key={`slide-${sectionIdx}`}
              className={`presentation-editor-slide ${dragIdx === orderIdx ? 'dragging' : ''} ${dragOverIdx === orderIdx ? 'drag-over' : ''}`}
              draggable
              onDragStart={() => handleDragStart(orderIdx)}
              onDragOver={e => handleDragOver(e, orderIdx)}
              onDrop={() => handleDrop(orderIdx)}
              onDragEnd={handleDragEnd}
            >
              <div
                className="presentation-editor-slide-preview"
                onClick={() => setEditingNotesFor(editingNotesFor === sectionIdx ? null : sectionIdx)}
              >
                {section.level === 2 ? (
                  <h2>{section.title}</h2>
                ) : (
                  <h3>{section.title}</h3>
                )}
                <div
                  className="presentation-slide-content"
                  dangerouslySetInnerHTML={{ __html: section.contentHtml }}
                />
              </div>
              <div className="presentation-editor-slide-footer">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <GripVertical size={14} style={{ color: 'var(--text-tertiary)', cursor: 'grab' }} />
                  <span className="presentation-editor-slide-title">
                    {section.title}
                  </span>
                </div>
                <div className="presentation-editor-slide-controls">
                  <button
                    onClick={() => setEditingNotesFor(editingNotesFor === sectionIdx ? null : sectionIdx)}
                    title="Edit notes"
                    className={speakerNotes[sectionIdx] ? 'active' : ''}
                  >
                    <SpeakerNotesIcon size={14} />
                  </button>
                  <button onClick={() => toggleExclude(sectionIdx)} title="Exclude slide">
                    <EyeOff size={14} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Excluded slides */}
      {excludedSlides.length > 0 && (
        <>
          <h3 style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem', margin: '1.5rem 0 0.75rem' }}>
            Excluded ({excludedSlides.length})
          </h3>
          <div className="presentation-editor-grid">
            {Array.from(excluded).map(sectionIdx => {
              const section = sections[sectionIdx]
              if (!section) return null

              return (
                <div
                  key={`excluded-${sectionIdx}`}
                  className="presentation-editor-slide excluded"
                  onClick={() => toggleExclude(sectionIdx)}
                >
                  <div className="presentation-editor-slide-preview">
                    {section.level === 2 ? (
                      <h2>{section.title}</h2>
                    ) : (
                      <h3>{section.title}</h3>
                    )}
                  </div>
                  <div className="presentation-editor-slide-footer">
                    <span className="presentation-editor-slide-title">{section.title}</span>
                    <div className="presentation-editor-slide-controls">
                      <button onClick={e => { e.stopPropagation(); toggleExclude(sectionIdx) }} title="Include slide">
                        <Eye size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Notes editor */}
      {editingNotesFor !== null && (() => {
        const section = sections[editingNotesFor]
        if (!section) return null
        return (
          <div className="presentation-editor-notes">
            <h2>Notes: {section.title}</h2>
            <textarea
              value={speakerNotes[editingNotesFor] || ''}
              onChange={e => updateNotes(editingNotesFor, e.target.value)}
              placeholder="Add speaker notes for this slide..."
            />
          </div>
        )
      })()}
    </div>
  )
}

function SpeakerNotesIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22" />
      <path d="m18 2 4 4-4 4" />
      <path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2" />
      <path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8" />
      <path d="m18 14 4 4-4 4" />
    </svg>
  )
}

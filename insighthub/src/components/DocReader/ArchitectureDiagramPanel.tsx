import { useState, useEffect, useRef, useCallback } from 'react'
import { GripVertical, X, Bookmark, Trash2, Plus, Loader2, ChevronLeft, ChevronRight, RefreshCw, ExternalLink } from 'lucide-react'
import { extractTopics, searchDiagramImages } from '@/services/archDiagramService'
import type { SearchImageResult } from '@/services/archDiagramService'
import { storageService } from '@/services/storageService'
import { usePreferenceStore } from '@/stores/preferenceStore'

interface ArchitectureDiagramPanelProps {
  docId: string
  docTitle: string
  docContent: string
  onClose: () => void
  onDiagramChange?: () => void
}

const SAVED_PER_PAGE = 6
const RESULTS_PER_PAGE = 12

const DEFAULT_POSITION = { x: Math.max(40, window.innerWidth - 1180 - 40), y: 60 }

function loadPanelPosition(docId: string) {
  try {
    const all = JSON.parse(localStorage.getItem('insighthub:arch-diagram-pos') || '{}')
    const saved = all[docId]
    if (saved) return { x: saved.x ?? DEFAULT_POSITION.x, y: Math.max(120, saved.y ?? DEFAULT_POSITION.y) }
  } catch { /* ignore */ }
  return DEFAULT_POSITION
}

function savePanelPosition(docId: string, x: number, y: number) {
  try {
    const all = JSON.parse(localStorage.getItem('insighthub:arch-diagram-pos') || '{}')
    all[docId] = { x, y }
    localStorage.setItem('insighthub:arch-diagram-pos', JSON.stringify(all))
  } catch { /* ignore */ }
}

interface SavedDiagram {
  id: string
  documentId: string
  url: string
  thumbnail: string
  title: string
  topic: string
  savedAt: number
  sourceUrl?: string
}

export function ArchitectureDiagramPanel({ docId, docTitle, docContent, onClose, onDiagramChange }: ArchitectureDiagramPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const initialPos = useRef(loadPanelPosition(docId))

  // Saved diagrams
  const [savedDiagrams, setSavedDiagrams] = useState<SavedDiagram[]>(() =>
    storageService.getArchDiagrams().filter((d: SavedDiagram) => d.documentId === docId),
  )
  const [savedPage, setSavedPage] = useState(0)

  // Topics: { topic: string; source: 'ai' | 'manual' }
  const [topics, setTopics] = useState<{ topic: string; source: 'ai' | 'manual' }[]>(() => {
    try {
      const all = JSON.parse(localStorage.getItem('insighthub:arch-diagram-topics') || '{}')
      const raw: string[] | { topic: string; source: 'ai' | 'manual' }[] = all[docId] || []
      // Migrate legacy plain string topics to AI-sourced
      return raw.map((t: any) => typeof t === 'string' ? { topic: t, source: 'ai' as const } : t)
    } catch { return [] }
  })
  const [activeTopic, setActiveTopic] = useState<string | null>(null)
  const [editingTopicIdx, setEditingTopicIdx] = useState<number | null>(null)
  const [newTopicInput, setNewTopicInput] = useState('')
  const [showNewTopicInput, setShowNewTopicInput] = useState(false)
  const [extracting, setExtracting] = useState(false)

  // Search results
  const [searchResults, setSearchResults] = useState<SearchImageResult[]>([])
  const [searchPage, setSearchPage] = useState(0)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  // Preview (track source for save/delete actions and navigation)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewMeta, setPreviewMeta] = useState<{ isSaved: boolean; id?: string; img?: SearchImageResult; topic?: string; index: number; sourceUrl?: string } | null>(null)

  const diagramSearchEngine = usePreferenceStore(s => s.diagramSearchEngine)

  // Persist topics to localStorage
  useEffect(() => {
    try {
      const all = JSON.parse(localStorage.getItem('insighthub:arch-diagram-topics') || '{}')
      all[docId] = topics
      localStorage.setItem('insighthub:arch-diagram-topics', JSON.stringify(all))
    } catch { /* ignore */ }
  }, [topics, docId])

  // Set initial position via DOM
  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    el.style.left = `${initialPos.current.x}px`
    el.style.top = `${initialPos.current.y}px`
  }, [])

  // Drag via pointer capture
  const onTitleBarPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input')) return
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
      savePanelPosition(docId, parseFloat(el.style.left), parseFloat(el.style.top))
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('lostpointercapture', lost)
  }, [docId])

  const handleExtractTopics = async () => {
    setExtracting(true)
    const result = await extractTopics(docTitle, docContent)
    if (result.success && result.topics) {
      const newAiTopics = result.topics.map(t => ({ topic: t, source: 'ai' as const }))
      const manualTopics = topics.filter(t => t.source === 'manual')
      const merged = [...manualTopics, ...newAiTopics]
      setTopics(merged)
      if (merged.length > 0) {
        setActiveTopic(merged[0].topic)
      }
    }
    setExtracting(false)
  }

  const handleSearch = useCallback(async (topic: string, page = 0) => {
    setSearching(true)
    setSearchError('')
    setSearchPage(page)
    const result = await searchDiagramImages(topic, diagramSearchEngine ?? 'google', page)
    if (result.success && result.results) {
      setSearchResults(result.results)
    } else {
      setSearchError(result.error || 'Search failed')
      setSearchResults([])
    }
    setSearching(false)
  }, [diagramSearchEngine])

  const handleTopicClick = (topic: string) => {
    setActiveTopic(topic)
    handleSearch(topic, 0)
  }

  const handleSaveDiagram = useCallback((img: SearchImageResult, topic: string) => {
    const now = Date.now()
    const diagram: SavedDiagram = {
      id: `diag-${now}-${Math.random().toString(36).slice(2, 6)}`,
      documentId: docId,
      url: img.url,
      thumbnail: img.url,
      title: img.title || topic,
      topic,
      savedAt: now,
      sourceUrl: img.sourceUrl || '',
    }
    const added = storageService.addArchDiagram(diagram)
    if (added) {
      setSavedDiagrams(prev => [diagram, ...prev])
      // Sync to server
      fetch('/api/arch-diagrams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([diagram, ...savedDiagrams]),
      }).catch(() => { /* ignore */ })
      onDiagramChange?.()
    }
  }, [docId, savedDiagrams, onDiagramChange])

  const handleDeleteDiagram = (id: string) => {
    storageService.removeArchDiagram(id)
    setSavedDiagrams(prev => prev.filter(d => d.id !== id))
    // Sync to server
    const updated = savedDiagrams.filter(d => d.id !== id)
    fetch('/api/arch-diagrams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(() => { /* ignore */ })
    // Adjust page if needed
    const maxPage = Math.max(0, Math.ceil((updated.length) / SAVED_PER_PAGE) - 1)
    if (savedPage > maxPage) setSavedPage(maxPage)
    onDiagramChange?.()
  }

  const handleAddTopic = () => {
    if (newTopicInput.trim()) {
      setTopics(prev => [...prev, { topic: newTopicInput.trim(), source: 'manual' }])
      setNewTopicInput('')
      setShowNewTopicInput(false)
    }
  }

  const handleDeleteTopic = (idx: number) => {
    setTopics(prev => prev.filter((_, i) => i !== idx))
    if (activeTopic === topics[idx]?.topic) {
      setActiveTopic(null)
      setSearchResults([])
    }
  }

  const handleEditTopic = (idx: number, newText: string) => {
    if (newText.trim()) {
      setTopics(prev => prev.map((t, i) => i === idx ? { ...t, topic: newText.trim() } : t))
      if (activeTopic === topics[idx]?.topic) {
        setActiveTopic(newText.trim())
      }
    }
    setEditingTopicIdx(null)
  }

  // Saved pagination
  const savedTotalPages = Math.max(1, Math.ceil(savedDiagrams.length / SAVED_PER_PAGE))
  const savedPaged = savedDiagrams.slice(savedPage * SAVED_PER_PAGE, (savedPage + 1) * SAVED_PER_PAGE)

  // Results pagination
  const resultsTotalPages = Math.max(1, Math.ceil(searchResults.length / RESULTS_PER_PAGE))
  const resultsPaged = searchResults.slice(searchPage * RESULTS_PER_PAGE, (searchPage + 1) * RESULTS_PER_PAGE)

  // Preview navigation
  const previewList = previewMeta?.isSaved ? savedPaged : resultsPaged
  const previewTotal = previewList.length

  const openPreview = useCallback((isSaved: boolean, index: number) => {
    const list = isSaved ? savedPaged : resultsPaged
    if (index < 0 || index >= list.length) return
    const item = list[index]
    if (isSaved) {
      const diag = item as SavedDiagram
      const params = new URLSearchParams({ url: diag.url })
      if (diag.sourceUrl) params.set('referer', diag.sourceUrl)
      setPreviewUrl(`/api/proxy-image?${params}`)
      setPreviewMeta({ isSaved: true, id: diag.id, topic: diag.topic, index, sourceUrl: diag.sourceUrl })
    } else {
      const img = item as SearchImageResult
      const params = new URLSearchParams({ url: img.url })
      if (img.sourceUrl) params.set('referer', img.sourceUrl)
      setPreviewUrl(`/api/proxy-image?${params}`)
      setPreviewMeta({ isSaved: false, img, topic: activeTopic || 'manual', index, sourceUrl: img.sourceUrl })
    }
  }, [savedPaged, resultsPaged, activeTopic])

  const navigatePreview = useCallback((dir: -1 | 1) => {
    if (!previewMeta || previewTotal <= 1) return
    const isSaved = previewMeta.isSaved
    const nextIdx = previewMeta.index + dir
    openPreview(isSaved, nextIdx)
  }, [previewMeta, previewTotal, openPreview])

  // Keyboard navigation in preview
  useEffect(() => {
    if (!previewUrl) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); navigatePreview(-1) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); navigatePreview(1) }
      else if (e.key === 'Escape') { setPreviewUrl(null); setPreviewMeta(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewUrl, navigatePreview])

  return (
    <div className="arch-diagram-panel" ref={panelRef}>
      {/* Titlebar */}
      <div className="arch-diagram-titlebar" onPointerDown={onTitleBarPointerDown}>
        <GripVertical size={14} className="arch-diagram-grip" />
        <span className="arch-diagram-title">Diagrams</span>
        <button className="arch-diagram-close-btn" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      {/* Body: left + right columns */}
      <div className="arch-diagram-body">
        {/* Left: Saved diagrams */}
        <div className="arch-diagram-saved">
          <div className="arch-diagram-section-header">
            <span>Saved ({savedDiagrams.length})</span>
          </div>
          {savedPaged.length > 0 ? (
            <div className="arch-diagram-saved-list">
              {savedPaged.map((diag, idx) => (
                <div key={diag.id} className="arch-diagram-card" onClick={() => openPreview(true, idx)}>
                  <img
                    src={diag.thumbnail || diag.url}
                    alt={diag.title}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                  />
                  <div className="arch-diagram-card-actions">
                    <button
                      className="arch-diagram-card-btn delete"
                      onClick={e => { e.stopPropagation(); handleDeleteDiagram(diag.id) }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="arch-diagram-card-label">{diag.title || diag.topic}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="arch-diagram-empty">No saved diagrams yet</div>
          )}
          {savedDiagrams.length > SAVED_PER_PAGE && (
            <div className="arch-diagram-pagination">
              <button
                className="arch-diagram-page-btn"
                disabled={savedPage === 0}
                onClick={() => setSavedPage(p => p - 1)}
              >
                <ChevronLeft size={14} />
              </button>
              <span className="arch-diagram-page-info">{savedPage + 1} / {savedTotalPages}</span>
              <button
                className="arch-diagram-page-btn"
                disabled={savedPage >= savedTotalPages - 1}
                onClick={() => setSavedPage(p => p + 1)}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Right: Search */}
        <div className="arch-diagram-search">
          <div className="arch-diagram-section-header">
            <span>Search</span>
            <button
              className="arch-diagram-extract-btn"
              onClick={handleExtractTopics}
              disabled={extracting}
            >
              {extracting ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />}
              {extracting ? 'Extracting...' : topics.length ? 'Re-extract' : 'Extract Topics'}
            </button>
          </div>

          {/* Topic chips */}
          <div className="arch-diagram-topics">
            {topics.map((t, idx) => (
              editingTopicIdx === idx ? (
                <input
                  key={idx}
                  className="arch-diagram-chip-edit"
                  defaultValue={t.topic}
                  autoFocus
                  onClick={e => e.stopPropagation()}
                  onBlur={e => handleEditTopic(idx, e.target.value)}
                  onKeyDown={e => {
                    if (e.nativeEvent.isComposing) return
                    if (e.key === 'Enter') handleEditTopic(idx, (e.target as HTMLInputElement).value)
                    if (e.key === 'Escape') setEditingTopicIdx(null)
                  }}
                />
              ) : (
                <span
                  key={idx}
                  className={`arch-diagram-chip${activeTopic === t.topic ? ' active' : ''}${t.source === 'manual' ? ' manual' : ''}`}
                  onClick={() => handleTopicClick(t.topic)}
                  onDoubleClick={e => { e.stopPropagation(); setEditingTopicIdx(idx) }}
                  title={t.source === 'manual' ? 'Manual keyword' : 'AI-extracted topic'}
                >
                  {t.topic}
                  <button
                    className="arch-diagram-chip-remove"
                    onClick={e => { e.stopPropagation(); handleDeleteTopic(idx) }}
                  >
                    <X size={11} />
                  </button>
                </span>
              )
            ))}
            {showNewTopicInput ? (
              <input
                className="arch-diagram-chip-edit"
                value={newTopicInput}
                autoFocus
                placeholder="New topic..."
                onClick={e => e.stopPropagation()}
                onChange={e => setNewTopicInput(e.target.value)}
                onKeyDown={e => {
                  if (e.nativeEvent.isComposing) return
                  if (e.key === 'Enter') handleAddTopic()
                  if (e.key === 'Escape') setShowNewTopicInput(false)
                }}
                onBlur={() => { handleAddTopic(); setShowNewTopicInput(false) }}
              />
            ) : (
              <button className="arch-diagram-chip-add" onClick={() => setShowNewTopicInput(true)}>
                <Plus size={13} />
              </button>
            )}
          </div>

          {/* Search results */}
          {searching ? (
            <div className="arch-diagram-empty">
              <Loader2 size={20} className="spin" />
              <span>Searching...</span>
            </div>
          ) : searchError ? (
            <div className="arch-diagram-empty">{searchError}</div>
          ) : searchResults.length > 0 ? (
            <>
              <div className="arch-diagram-results">
                {resultsPaged.map((img, idx) => (
                  <div key={img.url + idx} className="arch-diagram-card" onClick={() => openPreview(false, idx)}>
                    <img
                      src={img.thumbnail}
                      alt={img.title || 'Diagram'}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                    />
                    <div className="arch-diagram-card-actions">
                      <button
                        className="arch-diagram-card-btn save"
                        onClick={e => {
                          e.stopPropagation()
                          handleSaveDiagram(img, activeTopic || 'manual')
                        }}
                        title="Save diagram"
                      >
                        <Bookmark size={14} />
                      </button>
                    </div>
                    {img.title && <div className="arch-diagram-card-label">{img.title}</div>}
                  </div>
                ))}
              </div>
              {searchResults.length > RESULTS_PER_PAGE && (
                <div className="arch-diagram-pagination">
                  <button
                    className="arch-diagram-page-btn"
                    disabled={searchPage === 0}
                    onClick={() => setSearchPage(p => p - 1)}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="arch-diagram-page-info">{searchPage + 1} / {resultsTotalPages}</span>
                  <button
                    className="arch-diagram-page-btn"
                    disabled={searchPage >= resultsTotalPages - 1}
                    onClick={() => setSearchPage(p => p + 1)}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </>
          ) : activeTopic ? (
            <div className="arch-diagram-empty">No results found</div>
          ) : topics.length > 0 ? (
            <div className="arch-diagram-empty">Click a topic to search</div>
          ) : null}
        </div>
      </div>

      {/* Image preview overlay */}
      {previewUrl && (
        <div className="arch-diagram-preview" onClick={() => { setPreviewUrl(null); setPreviewMeta(null) }}>
          {/* Left arrow */}
          {previewTotal > 1 && (
            <button
              className={`arch-diagram-preview-nav left${previewMeta?.index === 0 ? ' disabled' : ''}`}
              onClick={e => { e.stopPropagation(); navigatePreview(-1) }}
              title="Previous"
            >
              <ChevronLeft size={28} />
            </button>
          )}
          <img
            src={previewUrl}
            alt="Preview"
            referrerPolicy="no-referrer"
            onClick={e => e.stopPropagation()}
            onError={() => {
              // Fallback to direct URL or thumbnail when proxy fails (e.g. 403 anti-hotlink)
              if (previewUrl.startsWith('/api/proxy-image')) {
                const item = previewList[previewMeta?.index ?? 0]
                if (item) {
                  const directUrl = previewMeta?.isSaved ? (item as SavedDiagram).url : (item as SearchImageResult).url
                  const thumbUrl = previewMeta?.isSaved ? (item as SavedDiagram).thumbnail : (item as SearchImageResult).thumbnail
                  setPreviewUrl(directUrl !== thumbUrl ? directUrl : thumbUrl)
                }
              }
            }}
          />
          {/* Right arrow */}
          {previewTotal > 1 && (
            <button
              className={`arch-diagram-preview-nav right${previewMeta && previewMeta.index >= previewTotal - 1 ? ' disabled' : ''}`}
              onClick={e => { e.stopPropagation(); navigatePreview(1) }}
              title="Next"
            >
              <ChevronRight size={28} />
            </button>
          )}
          {/* Bottom bar: page indicator + actions */}
          <div className="arch-diagram-preview-actions" onClick={e => e.stopPropagation()}>
            {previewTotal > 1 && (
              <span className="arch-diagram-preview-counter">{(previewMeta?.index ?? 0) + 1} / {previewTotal}</span>
            )}
            {previewMeta?.sourceUrl && (
              <a
                className="arch-diagram-preview-btn source"
                href={previewMeta.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="View source page"
                onClick={e => e.stopPropagation()}
              >
                <ExternalLink size={16} />
              </a>
            )}
            {previewMeta?.isSaved ? (
              <button
                className="arch-diagram-preview-btn delete"
                onClick={() => {
                  if (previewMeta.id) handleDeleteDiagram(previewMeta.id)
                  setPreviewUrl(null)
                  setPreviewMeta(null)
                }}
                title="Delete"
              >
                <Trash2 size={16} />
              </button>
            ) : previewMeta?.img ? (
              <button
                className="arch-diagram-preview-btn save"
                onClick={() => {
                  handleSaveDiagram(previewMeta.img!, previewMeta.topic || 'manual')
                  setPreviewMeta(prev => prev ? { ...prev, isSaved: true } : null)
                }}
                title="Save"
              >
                <Bookmark size={16} />
              </button>
            ) : null}
            <button
              className="arch-diagram-preview-btn close"
              onClick={() => { setPreviewUrl(null); setPreviewMeta(null) }}
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

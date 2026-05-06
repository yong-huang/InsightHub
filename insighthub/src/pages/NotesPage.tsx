import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, FileText, MessageSquare, Highlighter, BookOpen, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAnnotationStore } from '@/stores/annotationStore'
import { useDocumentStore } from '@/stores/documentStore'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { WikiLinkRenderer } from '@/components/DocReader/WikiLinkRenderer'
import { buildTitleLookup } from '@/utils/bidirectionalLinks'
import { exportNotesAsMarkdown } from '@/utils/notesExporter'
import { getShortLabel, getPrefix } from '@/utils/workspaceUtils'
import type { Annotation } from '@/types'

type NoteFilter = 'all' | 'highlight' | 'comment'

const PAGE_SIZE = 100

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface DocGroup {
  documentId: string
  title: string | null
  source: string | undefined
  annotations: Annotation[]
}

export function NotesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const annotations = useAnnotationStore(s => s.annotations)
  const documents = useDocumentStore(s => s.documents)
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const workspaces = usePreferenceStore(s => s.workspaces)
  const [filter, setFilter] = useState<NoteFilter>('all')
  const [docFilter, setDocFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  const titleLookup = useMemo(() => buildTitleLookup(documents), [documents])

  const getDocTitle = (docId: string) => {
    const doc = documents.get(docId)
    if (doc) return doc.title
    const wsPrefix = getPrefix(activeWorkspace, workspaces)
    const rest = wsPrefix ? docId.slice(wsPrefix.length) : docId
    return rest.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  const isWorkspaceMatch = (docId: string) => {
    const doc = documents.get(docId)
    if (doc) return doc.source === activeWorkspace
    const wsPrefix = getPrefix(activeWorkspace, workspaces) || ''
    return docId.startsWith(wsPrefix)
  }

  // Base annotations filtered by workspace, type, search, and document
  const baseAnnotations = useMemo(() => {
    return annotations
      .filter(a => isWorkspaceMatch(a.documentId))
      .filter(a => docFilter === 'all' || a.documentId === docFilter)
      .filter(a => filter === 'all' || a.type === filter)
      .filter(a => {
        if (!searchQuery.trim()) return true
        const q = searchQuery.toLowerCase()
        const doc = documents.get(a.documentId)
        return (
          a.text.toLowerCase().includes(q) ||
          (a.comment && a.comment.toLowerCase().includes(q)) ||
          (doc?.title.toLowerCase().includes(q))
        )
      })
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [annotations, activeWorkspace, filter, searchQuery, docFilter, documents])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(baseAnnotations.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const pagedAnnotations = useMemo(() => {
    return baseAnnotations.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  }, [baseAnnotations, safePage])

  // Reset page when filters change
  const handleFilterChange = useCallback((f: NoteFilter) => {
    setFilter(f)
    setCurrentPage(1)
  }, [])
  const handleDocFilterChange = useCallback((d: string) => {
    setDocFilter(d)
    setCurrentPage(1)
  }, [])
  const handleSearchChange = useCallback((q: string) => {
    setSearchQuery(q)
    setCurrentPage(1)
  }, [])

  // Doc groups for the current page
  const docGroups = useMemo((): DocGroup[] => {
    const map = new Map<string, DocGroup>()
    for (const ann of pagedAnnotations) {
      let group = map.get(ann.documentId)
      if (!group) {
        const doc = documents.get(ann.documentId)
        group = {
          documentId: ann.documentId,
          title: getDocTitle(ann.documentId),
          source: doc?.source,
          annotations: [],
        }
        map.set(ann.documentId, group)
      }
      group.annotations.push(ann)
    }
    return Array.from(map.values())
  }, [pagedAnnotations, documents])

  // Document options for dropdown (only docs that have annotations in workspace)
  const docOptions = useMemo(() => {
    const idSet = new Set<string>()
    for (const a of annotations) {
      if (isWorkspaceMatch(a.documentId)) idSet.add(a.documentId)
    }
    return Array.from(idSet)
      .map(id => ({ id, title: getDocTitle(id) }))
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [annotations, activeWorkspace, documents, workspaces])

  const totalCount = useMemo(() => {
    return annotations.filter(a => isWorkspaceMatch(a.documentId)).length
  }, [annotations, documents, activeWorkspace])

  const highlightCount = useMemo(() => {
    return annotations.filter(a =>
      a.type === 'highlight' && isWorkspaceMatch(a.documentId)
    ).length
  }, [annotations, documents, activeWorkspace])

  const commentCount = useMemo(() => {
    return annotations.filter(a =>
      a.type === 'comment' && isWorkspaceMatch(a.documentId)
    ).length
  }, [annotations, documents, activeWorkspace])

  const tabs: { key: NoteFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: totalCount },
    { key: 'highlight', label: 'Highlight', count: highlightCount },
    { key: 'comment', label: 'Comment', count: commentCount },
  ]

  const goToAnnotation = (ann: Annotation) => {
    sessionStorage.setItem('notes-scroll', String(window.scrollY))
    navigate(`/doc/${ann.documentId}`, {
      state: { from: '/notes', scrollToAnnotation: ann.id },
    })
  }

  const goToDocument = (docId: string) => {
    sessionStorage.setItem('notes-scroll', String(window.scrollY))
    navigate(`/doc/${docId}`, { state: { from: '/notes' } })
  }

  // Restore scroll position when navigating back from a document
  useEffect(() => {
    const saved = sessionStorage.getItem('notes-scroll')
    if (saved) {
      const timer = setTimeout(() => {
        window.scrollTo(0, Number(saved))
        sessionStorage.removeItem('notes-scroll')
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [location])

  // Pagination info text
  const startIdx = baseAnnotations.length > 0 ? (safePage - 1) * PAGE_SIZE + 1 : 0
  const endIdx = Math.min(safePage * PAGE_SIZE, baseAnnotations.length)

  return (
    <div className="cs-settings">
      {/* Page header */}
      <div className="cs-settings-header">
        <div className="cs-section-label">NOTES</div>
        <h1>All Notes</h1>
        <p className="cs-settings-subtitle">
          View, search and manage all your annotations across documents.
        </p>
      </div>

      {totalCount === 0 ? (
        <div className="cs-card">
          <div className="cs-card-body">
            <div className="cs-empty-hint">
              <BookOpen size={32} style={{ opacity: 0.3, marginBottom: '0.5rem', display: 'block' }} />
              Highlight text or add comments in documents — they will appear here.
            </div>
          </div>
        </div>
      ) : (
        <div className="cs-card">
          <div className="cs-card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <MessageSquare size={16} />
              ALL NOTES
              <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 'normal' }}>
                {baseAnnotations.length} notes
              </span>
            </div>
          </div>
          <div className="cs-card-body">
            {/* Row 1: type filter buttons */}
            <div className="cs-btn-group">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  className={`cs-btn ${filter === tab.key ? 'cs-btn-primary' : 'cs-btn-secondary'}`}
                  onClick={() => handleFilterChange(tab.key)}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>

            {/* Row 2: doc filter, search, export */}
            <div className="cs-notes-toolbar-row">
              <select
                className="cs-notes-doc-select"
                value={docFilter}
                onChange={e => handleDocFilterChange(e.target.value)}
              >
                <option value="all">All Documents</option>
                {docOptions.map(opt => (
                  <option key={opt.id} value={opt.id}>{opt.title}</option>
                ))}
              </select>
              <div className="cs-search-wrap" style={{ flex: 1 }}>
                <Search size={14} />
                <input
                  type="search"
                  className="cs-search-input"
                  placeholder="Search notes..."
                  value={searchQuery}
                  onChange={e => handleSearchChange(e.target.value)}
                />
              </div>
              <button
                className="cs-btn cs-btn-ghost"
                onClick={() => exportNotesAsMarkdown({ annotations: baseAnnotations, getDocTitle })}
                title="Export as Markdown"
              >
                <Download size={14} /> Export
              </button>
            </div>

            {baseAnnotations.length === 0 ? (
              <div className="cs-empty-hint">No matching notes found.</div>
            ) : (
              <div className="cs-notes-groups">
                {docGroups.map(group => (
                  <div key={group.documentId} className="cs-notes-group">
                    <div
                      className="cs-notes-group-header"
                      onClick={() => goToDocument(group.documentId)}
                    >
                      <div className="cs-model-info">
                        <div className="cs-model-name">
                          {group.title ?? 'Document deleted'}
                          {group.source && (
                            <span className="cs-badge" style={{
                              background: 'rgba(50, 108, 229, 0.08)',
                              color: 'var(--accent-blue)',
                              border: '1px solid rgba(50, 108, 229, 0.15)',
                            }}>
                              {getShortLabel(group.source, workspaces)}
                            </span>
                          )}
                        </div>
                        <div className="cs-model-meta">
                          <span>{group.annotations.length} notes</span>
                        </div>
                      </div>
                      <FileText size={16} style={{ color: 'var(--text-dim)' }} />
                    </div>
                    <div className="cs-notes-items">
                      {group.annotations.map(ann => (
                        <div
                          key={ann.id}
                          className={`cs-notes-item ${ann.type}`}
                          style={{
                            borderLeftColor: ann.color,
                            backgroundColor: ann.color + '15',
                          }}
                          onClick={() => goToAnnotation(ann)}
                        >
                          <div className="cs-notes-item-text">{ann.text}</div>
                          {ann.type === 'comment' && ann.comment && (
                            <div className="cs-notes-item-comment">
                              <MessageSquare size={12} />
                              <WikiLinkRenderer text={ann.comment} titleLookup={titleLookup} />
                            </div>
                          )}
                          <div className="cs-notes-item-meta">
                            <span className="cs-notes-item-type">
                              {ann.type === 'highlight' ? (
                                <><Highlighter size={12} /> Highlight</>
                              ) : (
                                <><MessageSquare size={12} /> Comment</>
                              )}
                            </span>
                            <span className="cs-notes-item-time">{formatTime(ann.createdAt)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {baseAnnotations.length > PAGE_SIZE && (
              <div className="cs-pagination">
                <span className="cs-pagination-info">
                  {startIdx}–{endIdx} of {baseAnnotations.length}
                </span>
                <div className="cs-pagination-btns">
                  <button
                    className="cs-btn cs-btn-ghost"
                    disabled={safePage <= 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                  >
                    <ChevronLeft size={14} /> Prev
                  </button>
                  <span className="cs-pagination-page">{safePage} / {totalPages}</span>
                  <button
                    className="cs-btn cs-btn-ghost"
                    disabled={safePage >= totalPages}
                    onClick={() => setCurrentPage(p => p + 1)}
                  >
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

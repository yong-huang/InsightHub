import { useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, FileText, Clock, X, ArrowRight } from 'lucide-react'
import { useSearchStore } from '@/stores/searchStore'
import { getCategoryInfo } from '@/utils/categoryMap'
import { highlightText, parseSearchQuery } from '@/services/searchService'
import { useDocumentStore } from '@/stores/documentStore'
import { useAnnotationStore } from '@/stores/annotationStore'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { getSourceColorBg, getSourceColor, getWorkspaceConfig } from '@/utils/workspaceUtils'

/** Render highlighted text with <mark> tags, splitting on ⫷…⫸ delimiters */
function HighlightedText({ text, query }: { text: string; query: string }) {
  const highlighted = useMemo(() => highlightText(text, query), [text, query])
  if (!highlighted.includes('⫷')) return <>{highlighted}</>
  const parts = highlighted.split(/([⫷⫸])/)
  const nodes: React.ReactNode[] = []
  let inMark = false
  for (const part of parts) {
    if (part === '⫷') { inMark = true; continue }
    if (part === '⫸') { inMark = false; continue }
    if (inMark) {
      nodes.push(<mark key={nodes.length} className="search-highlight">{part}</mark>)
    } else {
      nodes.push(part)
    }
  }
  return <>{nodes}</>
}

function FilterTags({ query }: { query: string }) {
  const { filters, text } = parseSearchQuery(query)
  const workspaces = usePreferenceStore(s => s.workspaces)
  const tags: { label: string; color: string }[] = []
  if (filters.category) {
    const catInfo = getCategoryInfo(filters.category)
    tags.push({ label: `Category: ${catInfo?.label || filters.category}`, color: 'var(--accent-blue)' })
  }
  if (filters.isRead === true) tags.push({ label: 'Read', color: 'var(--accent-green)' })
  if (filters.isRead === false) tags.push({ label: 'Unread', color: 'var(--accent-orange)' })
  if (filters.hasAnnotation) tags.push({ label: 'Has Notes', color: 'var(--accent-purple)' })
  if (filters.source) tags.push({ label: getWorkspaceConfig(filters.source, workspaces)?.label || filters.source, color: 'var(--accent-blue)' })
  if (filters.rating !== undefined) {
    tags.push({
      label: filters.rating === 0 ? 'Unrated' : `${filters.rating}+ Stars`,
      color: 'var(--accent-yellow)',
    })
  }
  if (tags.length === 0) return null
  return (
    <div className="search-filter-tags">
      {tags.map((t, i) => (
        <span key={i} className="search-filter-tag" style={{ borderColor: t.color, color: t.color }}>
          {t.label}
        </span>
      ))}
      {text && <span className="search-filter-tag search-filter-tag-text">"{text}"</span>}
    </div>
  )
}

export function SearchDialog() {
  const {
    showDialog, closeDialog, query, setQuery, results, isSearching,
    performSearch, searchHistory, removeHistory, clearHistory,
    suggestions, selectedIndex, setSelectedIndex, loadSuggestions,
  } = useSearchStore()
  const navigate = useNavigate()
  const location = useLocation()
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<number | null>(null)
  const isComposing = useRef(false)
  const documents = useDocumentStore(s => s.documents)
  const annotations = useAnnotationStore(s => s.annotations)
  const workspaces = usePreferenceStore(s => s.workspaces)

  // Apply post-search filters (isRead, hasAnnotation, rating) using docMap/annotation data
  const filteredResults = useMemo(() => {
    const { filters } = parseSearchQuery(query)
    if (filters.isRead === undefined && !filters.hasAnnotation && filters.rating === undefined) return results
    let filtered = [...results]
    if (filters.isRead !== undefined) {
      filtered = filtered.filter(r => {
        const doc = documents.get(r.id)
        return doc?.isRead === filters.isRead
      })
    }
    if (filters.hasAnnotation) {
      const annotatedDocIds = new Set(annotations.map(a => a.documentId))
      filtered = filtered.filter(r => annotatedDocIds.has(r.id))
    }
    if (filters.rating !== undefined) {
      if (filters.rating === 0) {
        filtered = filtered.filter(r => {
          const doc = documents.get(r.id)
          return !doc?.rating
        })
      } else {
        filtered = filtered.filter(r => {
          const doc = documents.get(r.id)
          return (doc?.rating || 0) >= filters.rating!
        })
      }
    }
    return filtered
  }, [results, query, documents, annotations])

  // Extract plain text query for highlighting
  const { text: plainQuery } = useMemo(() => parseSearchQuery(query), [query])

  // Trigger search — skip during IME composition
  const triggerSearch = useCallback((value: string) => {
    if (isComposing.current) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.trim()) {
      debounceRef.current = window.setTimeout(() => {
        performSearch(value)
        loadSuggestions(value)
      }, 200)
    } else {
      useSearchStore.setState({ results: [], suggestions: [] })
    }
  }, [performSearch, loadSuggestions])

  const handleInput = useCallback((value: string) => {
    setQuery(value)
    triggerSearch(value)
  }, [setQuery, triggerSearch])

  // Focus input when dialog opens
  useEffect(() => {
    if (showDialog) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [showDialog])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isComposing.current) return
    const total = filteredResults.length
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(total > 0 ? Math.min(selectedIndex + 1, total - 1) : -1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(selectedIndex > 0 ? selectedIndex - 1 : -1)
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < total) {
        navigateToResult(filteredResults[selectedIndex].id)
      } else if (filteredResults.length > 0) {
        navigateToResult(filteredResults[0].id)
      }
    } else if (e.key === 'Escape') {
      closeDialog()
    }
  }

  const navigateToResult = (docId: string) => {
    navigate(`/doc/${docId}`, { state: { from: location.pathname } })
    closeDialog()
  }

  // Handle history click
  const handleHistoryClick = (q: string) => {
    handleInput(q)
    performSearch(q)
  }

  if (!showDialog) return null

  return (
    <div className="search-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDialog() }}>
      <div className="search-dialog">
        <div className="search-dialog-input-wrap">
          <Search size={20} />
          <input
            ref={inputRef}
            type="text"
            className="search-dialog-input"
            placeholder="Search document titles or content... Supports category: is: has: rating: filters"
            value={query}
            onChange={e => handleInput(e.target.value)}
            onCompositionStart={() => { isComposing.current = true }}
            onCompositionEnd={e => {
              isComposing.current = false
              handleInput((e.target as HTMLInputElement).value)
            }}
            onKeyDown={handleKeyDown}
          />
          {query && (
            <button className="btn-icon" onClick={() => { setQuery(''); useSearchStore.setState({ results: [], suggestions: [] }) }}>
              <X size={16} />
            </button>
          )}
        </div>

        {/* Filter tags */}
        {query && <FilterTags query={query} />}

        <div className="search-dialog-results">
          {isSearching && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>
              Searching...
            </div>
          )}

          {!isSearching && filteredResults.length > 0 && (
            filteredResults.map((r, i) => {
              const catInfo = getCategoryInfo(r.category)
              return (
                <div
                  key={r.id}
                  className={`search-result-item${i === selectedIndex ? ' selected' : ''}`}
                  onClick={() => navigateToResult(r.id)}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <div className="search-result-icon" style={{ background: getSourceColorBg(r.source, workspaces), color: getSourceColor(r.source, workspaces) }}>
                    <FileText size={16} />
                  </div>
                  <div className="search-result-info">
                    <div className="search-result-title">
                      <HighlightedText text={r.title} query={plainQuery} />
                    </div>
                    <div className="search-result-meta">
                      {catInfo?.label || r.category}
                      <span style={{ margin: '0 4px' }}>·</span>
                      {getWorkspaceConfig(r.source, workspaces)?.label || r.source}
                    </div>
                    {r.snippet && (
                      <div className="search-result-snippet">
                        <HighlightedText text={r.snippet} query={plainQuery} />
                      </div>
                    )}
                  </div>
                  <ArrowRight size={14} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
                </div>
              )
            })
          )}

          {!isSearching && !query && searchHistory.length > 0 && (
            <>
              <div style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Search History</span>
                <button
                  className="search-history-clear-all"
                  onClick={() => clearHistory()}
                >
                  Clear All
                </button>
              </div>
              {searchHistory.map((q, i) => (
                <div
                  key={i}
                  className="search-history-item"
                  onClick={() => handleHistoryClick(q)}
                >
                  <Clock size={14} />
                  <span style={{ flex: 1 }}>{q}</span>
                  <button
                    className="search-history-delete"
                    onClick={e => { e.stopPropagation(); removeHistory(q) }}
                    title="Delete"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </>
          )}

          {!isSearching && query && filteredResults.length === 0 && suggestions.length > 0 && (
            <>
              <div style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600 }}>
                Related Documents
              </div>
              {suggestions.map((title, i) => (
                <div
                  key={i}
                  className="search-suggestion-item"
                  onClick={() => handleHistoryClick(title)}
                >
                  <FileText size={14} />
                  <span style={{ flex: 1 }}>{title}</span>
                  <ArrowRight size={12} style={{ color: 'var(--text-dim)' }} />
                </div>
              ))}
            </>
          )}

          {!isSearching && query && filteredResults.length === 0 && suggestions.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>
              No related documents found
            </div>
          )}
        </div>

        <div className="search-dialog-footer">
          <span>
            <kbd>↑↓</kbd> Navigate <kbd>Enter</kbd> Open <kbd>Esc</kbd> Close
          </span>
          <span>FlexSearch</span>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, FileText, Clock, X, ArrowRight } from 'lucide-react'
import { useSearchStore } from '@/stores/searchStore'
import { getCategoryInfo } from '@/utils/categoryMap'
import { search as flexSearch } from '@/services/searchService'

export function SearchDialog() {
  const {
    showDialog, closeDialog, query, setQuery, results, isSearching,
    performSearch, searchHistory,
  } = useSearchStore()
  const navigate = useNavigate()
  const location = useLocation()
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<number | null>(null)

  // Focus input when dialog opens
  useEffect(() => {
    if (showDialog) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [showDialog])

  // Debounced search
  const handleInput = useCallback((value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.trim()) {
      debounceRef.current = window.setTimeout(() => {
        performSearch(value)
      }, 200)
    } else {
      useSearchStore.setState({ results: [] })
    }
  }, [setQuery, performSearch])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && results.length > 0) {
      navigateToResult(results[0].id)
    }
    if (e.key === 'Escape') {
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
            placeholder="搜索文档标题或内容..."
            value={query}
            onChange={e => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {query && (
            <button className="btn-icon" onClick={() => { setQuery(''); useSearchStore.setState({ results: [] }) }}>
              <X size={16} />
            </button>
          )}
        </div>

        <div className="search-dialog-results">
          {isSearching && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>
              搜索中...
            </div>
          )}

          {!isSearching && results.length > 0 && (
            results.map(r => {
              const catInfo = getCategoryInfo(r.category)
              return (
                <div
                  key={r.id}
                  className="search-result-item"
                  onClick={() => navigateToResult(r.id)}
                >
                  <div className="search-result-icon" style={{
                    background: r.source === 'mindinsight'
                      ? 'rgba(255, 140, 66, 0.15)'
                      : 'rgba(50, 108, 229, 0.15)',
                    color: r.source === 'mindinsight'
                      ? 'var(--accent-orange)'
                      : 'var(--accent-blue)',
                  }}>
                    <FileText size={16} />
                  </div>
                  <div className="search-result-info">
                    <div className="search-result-title">{r.title}</div>
                    <div className="search-result-meta">
                      {catInfo?.label || r.category}
                      <span style={{ margin: '0 4px' }}>·</span>
                      {r.source === 'mindinsight' ? 'MindInsight' : 'TechInsight'}
                    </div>
                  </div>
                  <ArrowRight size={14} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
                </div>
              )
            })
          )}

          {!isSearching && !query && searchHistory.length > 0 && (
            <>
              <div style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600 }}>
                搜索历史
              </div>
              {searchHistory.map((q, i) => (
                <div
                  key={i}
                  className="search-history-item"
                  onClick={() => handleHistoryClick(q)}
                >
                  <Clock size={14} />
                  {q}
                </div>
              ))}
            </>
          )}

          {!isSearching && query && results.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>
              未找到相关文档
            </div>
          )}
        </div>

        <div className="search-dialog-footer">
          <span>
            <kbd>↑↓</kbd> 导航 <kbd>Enter</kbd> 打开 <kbd>Esc</kbd> 关闭
          </span>
          <span>FlexSearch</span>
        </div>
      </div>
    </div>
  )
}

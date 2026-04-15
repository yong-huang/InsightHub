import { useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Search, Clock, ArrowLeft } from 'lucide-react'
import { useSearchStore } from '@/stores/searchStore'
import { useDocumentStore } from '@/stores/documentStore'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { DocCard } from '@/components/shared/DocCard'
import { parseSearchQuery } from '@/services/searchService'

export function SearchPage() {
  const [searchParams] = useSearchParams()
  const initialQuery = searchParams.get('q') || ''
  const { results, isSearching, query, performSearch } = useSearchStore()
  const documents = useDocumentStore(s => s.documents)
  const getRecentReads = useDocumentStore(s => s.getRecentReads)
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)

  useEffect(() => {
    if (initialQuery) {
      performSearch(initialQuery)
    } else {
      performSearch('')
    }
  }, [initialQuery])

  const plainQuery = useMemo(() => parseSearchQuery(query).text, [query])

  const resultDocs = results
    .map(r => {
      const doc = documents.get(r.id)
      return doc ? { doc, snippet: r.snippet } : null
    })
    .filter((d): d is NonNullable<typeof d> => !!d)

  const recentReads = getRecentReads().filter(d => d.source === activeWorkspace)
  const navigate = useNavigate()

  return (
    <div className="page-search">
      <div className="search-page-header">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} title="返回">
          <ArrowLeft size={18} />
        </button>
        {!query ? (
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}><Clock size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} /> 最近阅读</h1>
        ) : (
          <span style={{ fontSize: '1rem', fontWeight: 600 }}>
            搜索: {query}
          </span>
        )}
        {results.length > 0 && (
          <span className="search-page-count">
            找到 {results.length} 个结果
          </span>
        )}
      </div>

      {isSearching && (
        <div className="empty-state">
          <p>搜索中...</p>
        </div>
      )}

      {!isSearching && query && results.length === 0 && (
        <div className="empty-state">
          <Search size={48} />
          <h3>未找到结果</h3>
          <p>尝试使用不同的关键词搜索</p>
        </div>
      )}

      {!isSearching && resultDocs.length > 0 && (
        <div className="doc-grid grid-3">
          {resultDocs.map(({ doc, snippet }) => (
            <DocCard key={doc.id} doc={doc} snippet={snippet} query={plainQuery} />
          ))}
        </div>
      )}

      {!isSearching && !query && recentReads.length > 0 && (
        <div className="section">
          <div className="recent-reads-grid">
            {recentReads.map(doc => (
              <DocCard key={doc.id} doc={doc} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useSearchStore } from '@/stores/searchStore'
import { useDocumentStore } from '@/stores/documentStore'
import { DocCard } from '@/components/shared/DocCard'

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQuery = searchParams.get('q') || ''
  const { results, isSearching, query, performSearch } = useSearchStore()
  const documents = useDocumentStore(s => s.documents)

  useEffect(() => {
    if (initialQuery) {
      performSearch(initialQuery)
    }
  }, [initialQuery])

  const handleSearch = (q: string) => {
    if (q.trim()) {
      setSearchParams({ q: q.trim() })
    } else {
      setSearchParams({})
    }
  }

  const resultDocs = results
    .map(r => documents.get(r.id))
    .filter((d): d is NonNullable<typeof d> => !!d)

  return (
    <div className="page-search">
      <div className="search-page-header">
        <div className="search-page-input-wrap">
          <Search size={18} />
          <input
            type="search"
            className="search-page-input"
            placeholder="搜索文档..."
            defaultValue={initialQuery}
            onKeyDown={e => e.key === 'Enter' && handleSearch(e.currentTarget.value)}
          />
        </div>
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
          {resultDocs.map(doc => (
            <DocCard key={doc.id} doc={doc} />
          ))}
        </div>
      )}
    </div>
  )
}

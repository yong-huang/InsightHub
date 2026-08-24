import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
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
  }, [initialQuery, performSearch])

  const plainQuery = useMemo(() => parseSearchQuery(query).text, [query])

  const resultDocs = useMemo(
    () => results
      .map(r => {
        const doc = documents.get(r.id)
        return doc ? { doc, snippet: r.snippet } : null
      })
      .filter((d): d is NonNullable<typeof d> => !!d),
    [results, documents],
  )

  const recentReads = useMemo(
    () => getRecentReads().filter(d => d.source === activeWorkspace),
    [getRecentReads, activeWorkspace],
  )
  const title = !query ? 'Recent Reads' : `Search: ${query}`

  return (
    <div className="cs-settings">
      <div className="cs-settings-header">
        <div className="cs-section-label">SEARCH</div>
        <h1>{title}</h1>
        {results.length > 0 && (
          <p className="cs-settings-subtitle">Found {results.length} results</p>
        )}
      </div>

      {isSearching && (
        <div className="cs-card">
          <div className="cs-card-body">
            <div className="cs-empty-hint">Searching...</div>
          </div>
        </div>
      )}

      {!isSearching && query && results.length === 0 && (
        <div className="cs-card">
          <div className="cs-card-body">
            <div className="cs-empty-hint">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-dim)' }}>
                <Search size={20} />
              </div>
              No results found. Try different keywords.
            </div>
          </div>
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
        <div className="doc-grid grid-3">
          {recentReads.map(doc => (
            <DocCard key={doc.id} doc={doc} />
          ))}
        </div>
      )}
    </div>
  )
}

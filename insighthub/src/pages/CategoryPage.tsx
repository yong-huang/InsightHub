import { useEffect, useMemo, useRef } from 'react'
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import { useTagStore } from '@/stores/tagStore'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { DocGrid } from '@/components/shared/DocGrid'
import { FilterBar } from '@/components/shared/FilterBar'
import { getCategoryInfo, getSourceFromCategory } from '@/utils/categoryMap'
import { getSourceFromPath, getWorkspaceConfig, getSourceLabel } from '@/utils/workspaceUtils'
import type { Source } from '@/types'

export function CategoryPage() {
  const { category: categoryParam } = useParams<{ category?: string; tagId?: string }>()
  const location = useLocation()
  const filteredDocuments = useDocumentStore(s => s.filteredDocuments)
  const filters = useDocumentStore(s => s.filters)
  const setFilters = useDocumentStore(s => s.setFilters)
  const resetFilters = useDocumentStore(s => s.resetFilters)
  const allTags = useTagStore(s => s.tags)
  const setWorkspace = usePreferenceStore(s => s.setWorkspace)
  const workspaces = usePreferenceStore(s => s.workspaces)
  const documents = useDocumentStore(s => s.documents)
  const navigate = useNavigate()

  // Parse source from pathname first segment
  const source = useMemo((): Source | undefined => {
    const pathSource = getSourceFromPath(location.pathname)
    if (!pathSource) return undefined
    return workspaces.some(w => w.id === pathSource) ? pathSource : undefined
  }, [location.pathname, workspaces])

  const category = categoryParam || undefined

  // Filter tags to only include documents from current workspace
  const filteredTags = useMemo(() => {
    if (!source) return allTags
    const workspaceDocIds = new Set(
      Array.from(documents.values())
        .filter(d => d.source === source)
        .map(d => d.id)
    )
    return allTags
      .map(t => ({
        ...t,
        documentIds: t.documentIds.filter(id => workspaceDocIds.has(id)),
      }))
      .filter(t => t.documentIds.length > 0)
  }, [allTags, documents, source])

  // Parse tagId from /tag/:tagId route
  const { tagId } = useParams<{ tagId?: string }>()
  const activeTag = useMemo(() => tagId ? allTags.find(t => t.id === tagId) : undefined, [tagId, allTags])

  // Track previous category to detect subcategory switches
  const prevCategoryRef = useRef(category)

  // Apply URL-based filters on mount and sync workspace
  useEffect(() => {
    const urlSource = source || (category ? getSourceFromCategory(category, documents) : undefined)
    if (urlSource) {
      setWorkspace(urlSource)
    }
    if (category !== prevCategoryRef.current) {
      resetFilters()
    }
    setFilters({ source: urlSource, category, tag: tagId || undefined })
    prevCategoryRef.current = category
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, category, tagId])

  const catInfo = category ? getCategoryInfo(category) : undefined

  const title = activeTag
    ? `Tag: ${activeTag.name}`
    : catInfo
      ? catInfo.label
      : source
        ? getSourceLabel(source, workspaces)
        : 'All Documents'

  return (
    <div className="cs-settings">
      <div className="cs-settings-header">
        {catInfo && source && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.5rem' }}>
            <Link
              to="/"
              style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.85rem' }}
              onClick={() => setWorkspace(source as Source)}
            >
              {getWorkspaceConfig(source, workspaces)?.label || source}
            </Link>
            <ChevronRight size={12} style={{ color: 'var(--text-dim)' }} />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>{catInfo.label}</span>
          </div>
        )}
        <h1>{title}</h1>
        <p className="cs-settings-subtitle">{filteredDocuments.length} documents</p>
      </div>

      {/* Only show filter bar when browsing all docs or a tag, not for a specific category */}
      {!category && (
        <div className="cs-card">
          <div className="cs-card-body" style={{ padding: '0.75rem 1rem' }}>
            <FilterBar
              filters={filters}
              onFilterChange={setFilters}
              showSourceFilter={false}
              onTagClear={() => { resetFilters(); navigate('/') }}
              onReset={() => { resetFilters(); navigate('/') }}
              tags={filteredTags}
            />
          </div>
        </div>
      )}

      <DocGrid documents={filteredDocuments} emptyMessage="No documents in this category" />
    </div>
  )
}

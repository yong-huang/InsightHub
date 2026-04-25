import { useEffect, useMemo, useRef } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { useDocumentStore } from '@/stores/documentStore'
import { useTagStore } from '@/stores/tagStore'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { DocGrid } from '@/components/shared/DocGrid'
import { FilterBar } from '@/components/shared/FilterBar'
import { getCategoryInfo, getSourceLabel, getSourceFromCategory, WORKSPACE_META, type Workspace } from '@/utils/categoryMap'
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
  const documents = useDocumentStore(s => s.documents)
  const navigate = useNavigate()

  // Parse source from pathname (/mindinsight/... or /techinsight/... or /leetcodeinsight/...)
  const source = useMemo((): Source | undefined => {
    const path = location.pathname
    if (path.startsWith('/mindinsight')) return 'mindinsight'
    if (path.startsWith('/techinsight')) return 'techinsight'
    if (path.startsWith('/leetcodeinsight')) return 'leetcodeinsight'
    return undefined
  }, [location.pathname])

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
    const urlSource = source || (category ? getSourceFromCategory(category) : undefined)
    if (urlSource) {
      setWorkspace(urlSource)
    }
    // Reset all filters (search text, tag selection, etc.) when switching categories
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
        ? getSourceLabel(source)
        : 'All Documents'

  const description = activeTag
    ? ''
    : catInfo
      ? ''
      : 'Browse all learning documents'

  return (
    <div className="page-category">
      <div className="page-header">
        {catInfo && source && (
          <nav className="breadcrumb">
            <a
              href=""
              onClick={e => { e.preventDefault(); setWorkspace(source as Workspace); navigate('/') }}
            >
              {WORKSPACE_META[source as Workspace].label}
            </a>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current">{catInfo.label}</span>
          </nav>
        )}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{filteredDocuments.length} documents</p>
      </div>

      <FilterBar
        filters={filters}
        onFilterChange={setFilters}
        showSourceFilter={false}
        onTagClear={() => { resetFilters(); navigate('/') }}
        onReset={() => { resetFilters(); navigate('/') }}
        tags={filteredTags}
      />

      <DocGrid documents={filteredDocuments} emptyMessage="No documents in this category" />
    </div>
  )
}

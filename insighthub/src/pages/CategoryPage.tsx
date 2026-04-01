import { useEffect, useMemo, useCallback } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { useDocumentStore } from '@/stores/documentStore'
import { useTagStore } from '@/stores/tagStore'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { DocGrid } from '@/components/shared/DocGrid'
import { FilterBar } from '@/components/shared/FilterBar'
import { getCategoryInfo, getSourceLabel, getSourceFromCategory, WORKSPACE_META, type Workspace } from '@/utils/categoryMap'

export function CategoryPage() {
  const { category: categoryParam } = useParams<{ category?: string; tagId?: string }>()
  const location = useLocation()
  const filteredDocuments = useDocumentStore(s => s.filteredDocuments)
  const filters = useDocumentStore(s => s.filters)
  const setFilters = useDocumentStore(s => s.setFilters)
  const resetFilters = useDocumentStore(s => s.resetFilters)
  const allTags = useTagStore(s => s.tags)
  const setWorkspace = usePreferenceStore(s => s.setWorkspace)
  const navigate = useNavigate()

  // Parse source from pathname (/mindinsight/... or /techinsight/...)
  const source = useMemo((): 'mindinsight' | 'techinsight' | undefined => {
    const path = location.pathname
    if (path.startsWith('/mindinsight')) return 'mindinsight'
    if (path.startsWith('/techinsight')) return 'techinsight'
    return undefined
  }, [location.pathname])

  const category = categoryParam || undefined

  // Parse tagId from /tag/:tagId route
  const { tagId } = useParams<{ tagId?: string }>()
  const activeTag = useMemo(() => tagId ? allTags.find(t => t.id === tagId) : undefined, [tagId, allTags])

  // Apply URL-based filters on mount and sync workspace
  useEffect(() => {
    const urlSource = source || (category ? getSourceFromCategory(category) : undefined)
    if (urlSource) {
      setWorkspace(urlSource)
    }
    setFilters({ source: urlSource, category, tag: tagId || undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, category, tagId])

  const catInfo = category ? getCategoryInfo(category) : undefined

  const title = activeTag
    ? `标签: ${activeTag.name}`
    : catInfo
      ? catInfo.label
      : source
        ? getSourceLabel(source)
        : '全部文档'

  const description = activeTag
    ? ''
    : catInfo
      ? ''
      : '浏览所有学习文档'

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
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{filteredDocuments.length} 篇文档</p>
      </div>

      <FilterBar
        filters={filters}
        onFilterChange={setFilters}
        showSourceFilter={false}
        onTagClear={() => { resetFilters(); navigate('/') }}
        onReset={() => { resetFilters(); navigate('/') }}
        tags={allTags}
      />

      <DocGrid documents={filteredDocuments} emptyMessage="该分类下暂无文档" />
    </div>
  )
}

import { useEffect, useMemo } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { useDocumentStore } from '@/stores/documentStore'
import { DocGrid } from '@/components/shared/DocGrid'
import { FilterBar } from '@/components/shared/FilterBar'
import { getCategoryInfo, getSourceLabel, getSourceFromCategory } from '@/utils/categoryMap'

export function CategoryPage() {
  const { category: categoryParam } = useParams<{ category?: string }>()
  const location = useLocation()
  const filteredDocuments = useDocumentStore(s => s.filteredDocuments)
  const filters = useDocumentStore(s => s.filters)
  const setFilters = useDocumentStore(s => s.setFilters)
  const resetFilters = useDocumentStore(s => s.resetFilters)

  // Parse source from pathname (/mindinsight/... or /techinsight/...)
  const source = useMemo((): 'mindinsight' | 'techinsight' | undefined => {
    const path = location.pathname
    if (path.startsWith('/mindinsight')) return 'mindinsight'
    if (path.startsWith('/techinsight')) return 'techinsight'
    return undefined
  }, [location.pathname])

  const category = categoryParam || undefined

  // Apply URL-based filters on mount
  useEffect(() => {
    const urlSource = source || (category ? getSourceFromCategory(category) : undefined)
    setFilters({ source: urlSource, category })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, category])

  const catInfo = category ? getCategoryInfo(category) : undefined

  const title = catInfo
    ? catInfo.label
    : source
      ? getSourceLabel(source)
      : '全部文档'

  const description = catInfo
    ? `${source === 'mindinsight' ? 'MindInsight' : 'TechInsight'} · ${catInfo.label}`
    : '浏览所有学习文档'

  return (
    <div className="page-category">
      <div className="page-header">
        <h1>{title}</h1>
        <p>{description} · {filteredDocuments.length} 篇文档</p>
      </div>

      <FilterBar
        filters={filters}
        onFilterChange={setFilters}
        onReset={() => {
          resetFilters()
          if (source || category) {
            setFilters({
              source: source || (category ? getSourceFromCategory(category) : undefined),
              category,
            })
          }
        }}
      />

      <DocGrid documents={filteredDocuments} emptyMessage="该分类下暂无文档" />
    </div>
  )
}

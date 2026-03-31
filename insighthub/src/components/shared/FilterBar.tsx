import { X } from 'lucide-react'
import type { SearchFilters, Tag } from '@/types'
import { CATEGORIES, getSourceLabel } from '@/utils/categoryMap'

interface FilterBarProps {
  filters: SearchFilters
  onFilterChange: (filters: Partial<SearchFilters>) => void
  onReset: () => void
  showCategoryFilter?: boolean
  showSourceFilter?: boolean
  tags?: Tag[]
  onTagClear?: () => void
}

export function FilterBar({ filters, onFilterChange, onReset, showCategoryFilter = true, showSourceFilter = true, tags = [], onTagClear }: FilterBarProps) {
  const hasFilters = filters.source || filters.category || filters.tag || filters.isRead !== undefined

  const activeTag = filters.tag ? tags.find(t => t.id === filters.tag) : null

  return (
    <div className="filter-bar">
      <div className="filter-group">
        {showSourceFilter && (
          <select
            className="filter-select"
            value={filters.source || ''}
            onChange={e => onFilterChange({ source: (e.target.value || undefined) as any })}
          >
            <option value="">全部来源</option>
            <option value="mindinsight">{getSourceLabel('mindinsight')}</option>
            <option value="techinsight">{getSourceLabel('techinsight')}</option>
          </select>
        )}

        {showCategoryFilter && (
          <select
            className="filter-select"
            value={filters.category || ''}
            onChange={e => onFilterChange({ category: e.target.value || undefined })}
          >
            <option value="">全部分类</option>
            {CATEGORIES.filter(cat => !filters.source || cat.source === filters.source).map(cat => (
              <option key={cat.key} value={cat.key}>
                {cat.label}
              </option>
            ))}
          </select>
        )}

        <select
          className="filter-select"
          value={filters.isRead === undefined ? '' : String(filters.isRead)}
          onChange={e => {
            const val = e.target.value
            onFilterChange({
              isRead: val === '' ? undefined : val === 'true',
            })
          }}
        >
          <option value="">全部状态</option>
          <option value="true">已读</option>
          <option value="false">未读</option>
        </select>

        {/* Tag filter */}
        <select
          className="filter-select"
          value={filters.tag || ''}
          onChange={e => onFilterChange({ tag: (e.target.value || undefined) as any })}
        >
          <option value="">全部标签</option>
          {tags.filter(t => t.documentIds.length > 0).map(tag => (
            <option key={tag.id} value={tag.id}>
              {tag.name} ({tag.documentIds.length})
            </option>
          ))}
        </select>
      </div>

      <div className="filter-group">
        {activeTag && (
          <span
            className="tag-pill"
            style={{ background: `${activeTag.color}20`, color: activeTag.color, cursor: 'pointer' }}
            onClick={() => { onFilterChange({ tag: undefined }); onTagClear?.() }}
          >
            {activeTag.name}
            <X size={10} />
          </span>
        )}

        {hasFilters && (
          <button className="btn btn-ghost btn-sm" onClick={onReset}>
            <X size={14} />
            清除筛选
          </button>
        )}
      </div>
    </div>
  )
}

import { X } from 'lucide-react'
import type { SearchFilters } from '@/types'
import { CATEGORIES, getSourceLabel } from '@/utils/categoryMap'

interface FilterBarProps {
  filters: SearchFilters
  onFilterChange: (filters: Partial<SearchFilters>) => void
  onReset: () => void
  showCategoryFilter?: boolean
}

export function FilterBar({ filters, onFilterChange, onReset, showCategoryFilter = true }: FilterBarProps) {
  const hasFilters = filters.source || filters.category || filters.tag || filters.isRead !== undefined

  return (
    <div className="filter-bar">
      <div className="filter-group">
        <select
          className="filter-select"
          value={filters.source || ''}
          onChange={e => onFilterChange({ source: (e.target.value || undefined) as any })}
        >
          <option value="">全部来源</option>
          <option value="mindinsight">{getSourceLabel('mindinsight')}</option>
          <option value="techinsight">{getSourceLabel('techinsight')}</option>
        </select>

        {showCategoryFilter && (
          <select
            className="filter-select"
            value={filters.category || ''}
            onChange={e => onFilterChange({ category: e.target.value || undefined })}
          >
            <option value="">全部分类</option>
            {CATEGORIES.map(cat => (
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
      </div>

      {hasFilters && (
        <button className="btn btn-ghost btn-sm" onClick={onReset}>
          <X size={14} />
          清除筛选
        </button>
      )}
    </div>
  )
}

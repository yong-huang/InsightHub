import { X } from 'lucide-react'
import type { SearchFilters, Tag } from '@/types'
import { CATEGORIES, getSourceLabel, WORKSPACE_META } from '@/utils/categoryMap'

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
  const hasFilters = filters.source || filters.category || filters.tag || filters.isRead !== undefined || filters.sortBy

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
            <option value="">All Sources</option>
            {(Object.keys(WORKSPACE_META) as Array<keyof typeof WORKSPACE_META>).map(key => (
              <option key={key} value={key}>{getSourceLabel(key)}</option>
            ))}
          </select>
        )}

        {showCategoryFilter && (
          <select
            className="filter-select"
            value={filters.category || ''}
            onChange={e => onFilterChange({ category: e.target.value || undefined })}
          >
            <option value="">All Categories</option>
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
          <option value="">All Status</option>
          <option value="true">Read</option>
          <option value="false">Unread</option>
        </select>

        <select
          className="filter-select"
          value={filters.sortBy || ''}
          onChange={e => onFilterChange({ sortBy: e.target.value || undefined })}
        >
          <option value="">Default Sort</option>
          <option value="title-asc">Title A→Z</option>
          <option value="title-desc">Title Z→A</option>
          <option value="lastRead-desc">Recently Read</option>
          <option value="readCount-desc">Most Read</option>
          <option value="wordCount-desc">Longest</option>
          <option value="wordCount-asc">Shortest</option>
        </select>

        {/* Tag filter */}
        <select
          className="filter-select"
          value={filters.tag || ''}
          onChange={e => onFilterChange({ tag: (e.target.value || undefined) as any })}
        >
          <option value="">All Tags</option>
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
            Clear Filters
          </button>
        )}
      </div>
    </div>
  )
}

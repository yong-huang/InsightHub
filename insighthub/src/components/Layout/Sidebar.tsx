import { useMemo, useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Tag } from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useTagStore } from '@/stores/tagStore'
import { FileTree } from '@/components/Layout/FileTree'
import { getGradientClass } from '@/utils/workspaceUtils'

export function Sidebar() {
  const { sidebarCollapsed, activeWorkspace, workspaces } = usePreferenceStore()
  const tags = useTagStore(s => s.tags)
  const documents = useDocumentStore(s => s.documents)

  const activeWs = workspaces.find(w => w.id === activeWorkspace)

  // Memoize tag filtering to avoid recomputing on every render
  const workspaceTags = useMemo(() => {
    const wsDocIds = new Set(
      Array.from(documents.values()).filter(d => d.source === activeWorkspace && !d.isDeprecated).map(d => d.id)
    )
    return tags
      .map(tag => ({
        ...tag,
        documentIds: tag.documentIds.filter(id => wsDocIds.has(id)),
      }))
      .filter(tag => tag.documentIds.length > 0)
  }, [documents, activeWorkspace, tags])

  return (
    <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-content">
        {/* File tree section */}
        <div className="sidebar-section">
          <Link to="/" className="sidebar-section-title" style={{ textDecoration: 'none' }}>
            <span className={getGradientClass(activeWorkspace, workspaces)}>
              {activeWs?.label || activeWorkspace}
            </span>
          </Link>
          <FileTree />
        </div>

        {/* Tags section */}
        {workspaceTags.length > 0 && (
          <div className="sidebar-section">
            <div className="sidebar-section-title">
              <Tag size={14} />
              <span>Tags</span>
            </div>
            <div className="sidebar-tags">
              {workspaceTags.slice(0, 10).map(tag => (
                <Link
                  key={tag.id}
                  to={`/tag/${tag.id}`}
                  className="sidebar-tag"
                  style={{ '--tag-color': tag.color } as React.CSSProperties}
                >
                  {tag.name}
                  <span className="sidebar-tag-count">{tag.documentIds.length}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

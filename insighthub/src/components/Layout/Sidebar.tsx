import { Link, useParams } from 'react-router-dom'
import {
  GraduationCap, Film, BookOpen, Brain,
  Cpu, GitBranch, Cloud, Server, Network, Code,
  TrendingUp, Landmark, BarChart3,
  ChevronLeft, ChevronRight, Tag,
} from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useTagStore } from '@/stores/tagStore'
import { getCategoriesBySource, WORKSPACE_META } from '@/utils/categoryMap'

const ICON_MAP: Record<string, React.ReactNode> = {
  GraduationCap: <GraduationCap size={18} />,
  Film: <Film size={18} />,
  TrendingUp: <TrendingUp size={18} />,
  Landmark: <Landmark size={18} />,
  BookOpen: <BookOpen size={18} />,
  Brain: <Brain size={18} />,
  Cpu: <Cpu size={18} />,
  GitBranch: <GitBranch size={18} />,
  Cloud: <Cloud size={18} />,
  Server: <Server size={18} />,
  Network: <Network size={18} />,
  Code: <Code size={18} />,
  BarChart3: <BarChart3 size={18} />,
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, activeWorkspace } = usePreferenceStore()
  const categoryCounts = useDocumentStore(s => s.categoryCounts)
  const tags = useTagStore(s => s.tags)
  const documents = useDocumentStore(s => s.documents)
  const params = useParams()

  const meta = WORKSPACE_META[activeWorkspace]
  const categories = getCategoriesBySource(activeWorkspace)

  // Filter tags to only those with docs in current workspace
  const workspaceDocIds = new Set(
    Array.from(documents.values()).filter(d => d.source === activeWorkspace).map(d => d.id)
  )
  const workspaceTags = tags
    .map(tag => ({
      ...tag,
      documentIds: tag.documentIds.filter(id => workspaceDocIds.has(id)),
    }))
    .filter(tag => tag.documentIds.length > 0)

  return (
    <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-content">
        {/* Categories section */}
        <div className="sidebar-section">
          {!sidebarCollapsed && (
            <div className="sidebar-section-title">
              <span className={meta.gradientClass}>{meta.label}</span>
            </div>
          )}
          {categories.map(cat => {
            const isActive = params.category === cat.key
            return (
              <Link
                key={cat.key}
                to={`${meta.basePath}/${cat.key}`}
                className={`sidebar-item ${isActive ? 'active' : ''}`}
                title={cat.label}
              >
                <span className="sidebar-item-icon">{ICON_MAP[cat.icon]}</span>
                {!sidebarCollapsed && (
                  <>
                    <span className="sidebar-item-label">{cat.label}</span>
                    <span className="sidebar-item-count">{categoryCounts[cat.key] || 0}</span>
                  </>
                )}
              </Link>
            )
          })}
        </div>

        {/* Tags section */}
        {workspaceTags.length > 0 && !sidebarCollapsed && (
          <div className="sidebar-section">
            <div className="sidebar-section-title">
              <Tag size={14} />
              <span>标签</span>
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

      <button className="sidebar-toggle" onClick={toggleSidebar}>
        {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </aside>
  )
}

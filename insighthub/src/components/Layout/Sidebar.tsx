import { Link, useParams } from 'react-router-dom'
import {
  GraduationCap, Film, BookOpen, Brain,
  Cpu, GitBranch, Cloud, Server, Network, Code,
  TrendingUp, Landmark,
  ChevronLeft, ChevronRight, Tag,
} from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useTagStore } from '@/stores/tagStore'
import { CATEGORIES, getCategoriesBySource } from '@/utils/categoryMap'

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
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = usePreferenceStore()
  const categoryCounts = useDocumentStore(s => s.categoryCounts)
  const tags = useTagStore(s => s.tags)
  const params = useParams()

  const miCategories = getCategoriesBySource('mindinsight')
  const tiCategories = getCategoriesBySource('techinsight')

  return (
    <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-content">
        {/* MindInsight section */}
        <div className="sidebar-section">
          {!sidebarCollapsed && (
            <div className="sidebar-section-title">
              <span className="gradient-text-warm">MindInsight</span>
            </div>
          )}
          {miCategories.map(cat => {
            const isActive = params.category === cat.key
            return (
              <Link
                key={cat.key}
                to={`/mindinsight/${cat.key}`}
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

        {/* TechInsight section */}
        <div className="sidebar-section">
          {!sidebarCollapsed && (
            <div className="sidebar-section-title">
              <span className="gradient-text">TechInsight</span>
            </div>
          )}
          {tiCategories.map(cat => {
            const isActive = params.category === cat.key
            return (
              <Link
                key={cat.key}
                to={`/techinsight/${cat.key}`}
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
        {tags.length > 0 && !sidebarCollapsed && (
          <div className="sidebar-section">
            <div className="sidebar-section-title">
              <Tag size={14} />
              <span>标签</span>
            </div>
            <div className="sidebar-tags">
              {tags.slice(0, 10).map(tag => (
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

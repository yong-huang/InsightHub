import { useMemo, useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  GraduationCap, Film, BookOpen, Brain,
  Cpu, GitBranch, Cloud, Server, Network, Code,
  TrendingUp, Landmark, BarChart3, Monitor, Briefcase,
  ChevronLeft, ChevronRight, Tag, MessageSquare, Bookmark, Trophy,
  Map,
} from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useTagStore } from '@/stores/tagStore'
import { useAnnotationStore } from '@/stores/annotationStore'
import { getCategoriesBySource, WORKSPACE_META } from '@/utils/categoryMap'
import { storageService } from '@/services/storageService'

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
  Monitor: <Monitor size={18} />,
  Briefcase: <Briefcase size={18} />,
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, activeWorkspace } = usePreferenceStore()
  const categoryCounts = useDocumentStore(s => s.categoryCounts)
  const tags = useTagStore(s => s.tags)
  const documents = useDocumentStore(s => s.documents)
  const allAnnotations = useAnnotationStore(s => s.annotations)
  const commentCount = useMemo(() => {
    return allAnnotations.filter(a => {
      if (a.type !== 'comment') return false
      const doc = documents.get(a.documentId)
      return doc?.source === activeWorkspace
    }).length
  }, [allAnnotations, documents, activeWorkspace])

  const [readLaterCount, setReadLaterCount] = useState(() => {
    return storageService.getReadLaterList().length
  })
  const [achievementCount, setAchievementCount] = useState(() => {
    return storageService.getAchievementState().unlockedIds.length
  })
  useEffect(() => {
    const refresh = () => {
      setReadLaterCount(storageService.getReadLaterList().length)
      setAchievementCount(storageService.getAchievementState().unlockedIds.length)
    }
    window.addEventListener('storage', refresh)
    window.addEventListener('achievement-unlock', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('achievement-unlock', refresh)
    }
  }, [])

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

        {/* Notes section */}
        {!sidebarCollapsed && (
          <div className="sidebar-section">
            <Link to="/notes" className="sidebar-item">
              <span className="sidebar-item-icon"><MessageSquare size={18} /></span>
              <span className="sidebar-item-label">所有批注</span>
              <span className="sidebar-item-count">{commentCount}</span>
            </Link>
            <Link to="/stats" className="sidebar-item">
              <span className="sidebar-item-icon"><BarChart3 size={18} /></span>
              <span className="sidebar-item-label">数据统计</span>
            </Link>
            <Link to="/read-later" className="sidebar-item">
              <span className="sidebar-item-icon"><Bookmark size={18} /></span>
              <span className="sidebar-item-label">稍后阅读</span>
              {readLaterCount > 0 && (
                <span className="sidebar-item-count">{readLaterCount}</span>
              )}
            </Link>
            <Link to="/knowledge-graph" className="sidebar-item">
              <span className="sidebar-item-icon"><Network size={18} /></span>
              <span className="sidebar-item-label">知识图谱</span>
            </Link>
            <Link to="/learning-path" className="sidebar-item">
              <span className="sidebar-item-icon"><Map size={18} /></span>
              <span className="sidebar-item-label">学习路径</span>
            </Link>
            <Link to="/achievements" className="sidebar-item">
              <span className="sidebar-item-icon"><Trophy size={18} /></span>
              <span className="sidebar-item-label">成就系统</span>
              <span className="sidebar-item-count">{achievementCount}/20</span>
            </Link>
          </div>
        )}
        {sidebarCollapsed && (
          <Link to="/notes" className="sidebar-item" title="笔记">
            <span className="sidebar-item-icon"><MessageSquare size={18} /></span>
            {commentCount > 0 && (
              <span className="sidebar-item-count">{commentCount}</span>
            )}
          </Link>
        )}
        {sidebarCollapsed && (
          <Link to="/stats" className="sidebar-item" title="数据统计">
            <span className="sidebar-item-icon"><BarChart3 size={18} /></span>
          </Link>
        )}
        {sidebarCollapsed && (
          <Link to="/read-later" className="sidebar-item" title="稍后阅读">
            <span className="sidebar-item-icon"><Bookmark size={18} /></span>
            {readLaterCount > 0 && (
              <span className="sidebar-item-count">{readLaterCount}</span>
            )}
          </Link>
        )}
        {sidebarCollapsed && (
          <Link to="/knowledge-graph" className="sidebar-item" title="知识图谱">
            <span className="sidebar-item-icon"><Network size={18} /></span>
          </Link>
        )}
        {sidebarCollapsed && (
          <Link to="/learning-path" className="sidebar-item" title="学习路径">
            <span className="sidebar-item-icon"><Map size={18} /></span>
          </Link>
        )}
        {sidebarCollapsed && (
          <Link to="/achievements" className="sidebar-item" title="成就系统">
            <span className="sidebar-item-icon"><Trophy size={18} /></span>
          </Link>
        )}

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

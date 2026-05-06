import { useRef, useState, useMemo, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Search, Sun, Moon, Brain, Cpu, Code2, ChevronDown, Check, Settings, Upload, BarChart3,
  MessageSquare, Bookmark, Trophy, Network, Route, PanelLeftClose, PanelLeftOpen,
  GraduationCap, BookOpen, Sparkles, Server, Cloud, Database, Terminal, GitBranch,
  Briefcase, Globe, Layers, Lightbulb, ShieldCheck, FileText, FolderOpen, Box, Package,
} from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { prefetchRoute } from '@/utils/prefetchRoute'
import { useSearchStore } from '@/stores/searchStore'
import { useAnnotationStore } from '@/stores/annotationStore'
import { useDocumentStore } from '@/stores/documentStore'
import { ImportDialog } from '@/components/Import/ImportDialog'
import { storageService } from '@/services/storageService'

const ICON_MAP: Record<string, React.ReactNode> = {
  Brain: <Brain size={18} />,
  Cpu: <Cpu size={18} />,
  Code2: <Code2 size={18} />,
  GraduationCap: <GraduationCap size={18} />,
  BookOpen: <BookOpen size={18} />,
  Sparkles: <Sparkles size={18} />,
  Server: <Server size={18} />,
  Cloud: <Cloud size={18} />,
  Database: <Database size={18} />,
  Terminal: <Terminal size={18} />,
  GitBranch: <GitBranch size={18} />,
  Network: <Network size={18} />,
  BarChart3: <BarChart3 size={18} />,
  Briefcase: <Briefcase size={18} />,
  Globe: <Globe size={18} />,
  Layers: <Layers size={18} />,
  Lightbulb: <Lightbulb size={18} />,
  ShieldCheck: <ShieldCheck size={18} />,
  FileText: <FileText size={18} />,
  FolderOpen: <FolderOpen size={18} />,
  Box: <Box size={18} />,
  Package: <Package size={18} />,
}

export function Navbar() {
  const {
    theme, toggleTheme, activeWorkspace, setWorkspace,
    workspaces, sidebarCollapsed, toggleSidebar,
  } = usePreferenceStore()
  const openDialog = useSearchStore(s => s.openDialog)
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [importFiles, setImportFiles] = useState<File[] | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const activeWs = workspaces.find(w => w.id === activeWorkspace)

  // Compute badge counts
  const documents = useDocumentStore(s => s.documents)
  const allAnnotations = useAnnotationStore(s => s.annotations)

  const noteCount = useMemo(() => {
    return allAnnotations.filter(a => {
      const doc = documents.get(a.documentId)
      return doc?.source === activeWorkspace
    }).length
  }, [allAnnotations, documents, activeWorkspace])

  // Refresh badge counts when localStorage changes (bookmarks, achievements, etc.)
  const [storageVersion, setStorageVersion] = useState(0)
  useEffect(() => {
    const handler = () => setStorageVersion(v => v + 1)
    window.addEventListener('storage', handler)
    window.addEventListener('achievement-unlock', handler)
    return () => {
      window.removeEventListener('storage', handler)
      window.removeEventListener('achievement-unlock', handler)
    }
  }, [])

  const readLaterCount = useMemo(() => {
    const readLaterList = storageService.getReadLaterList()
    return readLaterList.filter(item => {
      const doc = documents.get(item.documentId)
      return doc?.source === activeWorkspace
    }).length
  }, [documents, activeWorkspace, storageVersion])

  const achievementCount = useMemo(() => {
    return storageService.getAchievementState().unlockedIds.length
  }, [storageVersion])

  const handleSwitch = (wsId: string) => {
    if (wsId === activeWorkspace) {
      setMenuOpen(false)
      return
    }
    setWorkspace(wsId)
    setMenuOpen(false)
    navigate('/')
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setMenuOpen(false)
    }
  }

  const navButtons = [
    { icon: MessageSquare, label: 'All Notes', to: '/notes', badge: noteCount },
    { icon: Bookmark, label: 'Read Later', to: '/read-later', badge: readLaterCount },
    { icon: Trophy, label: 'Achievements', to: '/achievements', badge: achievementCount },
    { icon: Network, label: 'Knowledge Graph', to: '/knowledge-graph', badge: 0 },
    { icon: Route, label: 'Learning Path', to: '/learning-path', badge: 0 },
    { icon: BarChart3, label: 'Statistics', to: '/stats', badge: 0 },
    { icon: Settings, label: 'Settings', to: '/settings', badge: 0 },
  ]

  return (
    <nav className="navbar" onMouseDown={handleMouseDown}>
      <div className="navbar-inner">
        <div className="navbar-left">
          <div className="workspace-switcher" ref={menuRef}>
            <button
              className="workspace-switcher-btn"
              onClick={() => setMenuOpen(v => !v)}
            >
              {activeWs && ICON_MAP[activeWs.icon] ? ICON_MAP[activeWs.icon] : <Brain size={18} />}
              <span className="workspace-switcher-label">{activeWs?.label || activeWorkspace}</span>
              <ChevronDown size={14} />
            </button>

            {menuOpen && (
              <div className="workspace-switcher-menu">
                {workspaces.map(ws => (
                  <button
                    key={ws.id}
                    className={`workspace-switcher-item ${ws.id === activeWorkspace ? 'active' : ''}`}
                    onClick={() => handleSwitch(ws.id)}
                  >
                    <span className="workspace-switcher-item-icon">
                      {ICON_MAP[ws.icon] || <Brain size={18} />}
                    </span>
                    <span className="workspace-switcher-item-label">
                      {ws.label}
                      {ws.subtitle && <span className="workspace-switcher-item-sub">{ws.subtitle}</span>}
                    </span>
                    {ws.id === activeWorkspace && <Check size={14} className="workspace-switcher-check" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            className="navbar-icon-btn sidebar-toggle-btn"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            <span className="navbar-icon-tooltip">{sidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}</span>
          </button>
        </div>

        <div className="navbar-right">
          <button className="navbar-icon-btn" title="Search (⌘K)" onClick={openDialog}>
            <Search size={18} />
            <span className="navbar-icon-tooltip">Search</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,.htm"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              const fileList = e.target.files
              if (fileList && fileList.length > 0) {
                setImportFiles(Array.from(fileList))
              }
              e.target.value = ''
            }}
          />
          <button className="navbar-icon-btn" title="Import" onClick={() => fileInputRef.current?.click()}>
            <Upload size={18} />
            <span className="navbar-icon-tooltip">Import</span>
          </button>

          {navButtons.map(btn => (
            <Link
              key={btn.to}
              to={btn.to}
              className="navbar-icon-btn"
              title={btn.label}
              onMouseEnter={() => prefetchRoute(btn.to)}
            >
              <btn.icon size={18} />
              {btn.badge > 0 && <span className="navbar-icon-badge">{btn.badge}</span>}
              <span className="navbar-icon-tooltip">{btn.label}</span>
            </Link>
          ))}

          <button className="navbar-icon-btn theme-toggle" onClick={toggleTheme} title="Toggle Theme">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            <span className="navbar-icon-tooltip">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
        </div>
      </div>

      {importFiles && (
        <ImportDialog
          files={importFiles}
          onClose={() => setImportFiles(null)}
        />
      )}
    </nav>
  )
}

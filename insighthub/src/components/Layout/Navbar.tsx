import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, Sun, Moon, Brain, Cpu, ChevronDown, Check, Settings } from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useSearchStore } from '@/stores/searchStore'
import { WORKSPACE_META, type Workspace } from '@/utils/categoryMap'

const ICON_MAP: Record<string, React.ReactNode> = {
  Brain: <Brain size={18} />,
  Cpu: <Cpu size={18} />,
}

export function Navbar() {
  const { theme, toggleTheme, activeWorkspace, setWorkspace } = usePreferenceStore()
  const openDialog = useSearchStore(s => s.openDialog)
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const meta = WORKSPACE_META[activeWorkspace]

  const handleSwitch = (ws: Workspace) => {
    if (ws === activeWorkspace) {
      setMenuOpen(false)
      return
    }
    setWorkspace(ws)
    setMenuOpen(false)
    navigate('/')
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setMenuOpen(false)
    }
  }

  return (
    <nav className="navbar" onMouseDown={handleMouseDown}>
      <div className="navbar-inner">
        <div className="navbar-left">
          <div className="workspace-switcher" ref={menuRef}>
            <button
              className="workspace-switcher-btn"
              onClick={() => setMenuOpen(v => !v)}
            >
              {ICON_MAP[meta.icon]}
              <span className="workspace-switcher-label">{meta.label}</span>
              <ChevronDown size={14} />
            </button>

            {menuOpen && (
              <div className="workspace-switcher-menu">
                {(Object.keys(WORKSPACE_META) as Workspace[]).map(ws => {
                  const m = WORKSPACE_META[ws]
                  return (
                    <button
                      key={ws}
                      className={`workspace-switcher-item ${ws === activeWorkspace ? 'active' : ''}`}
                      onClick={() => handleSwitch(ws)}
                    >
                      <span className="workspace-switcher-item-icon">{ICON_MAP[m.icon]}</span>
                      <span className="workspace-switcher-item-label">
                        {m.label}
                        <span className="workspace-switcher-item-sub">{m.subtitle}</span>
                      </span>
                      {ws === activeWorkspace && <Check size={14} className="workspace-switcher-check" />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="navbar-right">
          <button className="search-trigger" onClick={openDialog}>
            <Search size={16} />
            <span>搜索文档...</span>
            <kbd>⌘K</kbd>
          </button>
          <Link to="/settings" className="btn-icon" title="设置">
            <Settings size={18} />
          </Link>
          <button className="btn-icon theme-toggle" onClick={toggleTheme} title="切换主题">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>
    </nav>
  )
}

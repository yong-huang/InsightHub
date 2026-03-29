import { Link, useLocation } from 'react-router-dom'
import { Search, Sun, Moon, BookOpen, Menu, Settings } from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useSearchStore } from '@/stores/searchStore'

export function Navbar() {
  const { theme, toggleTheme, sidebarCollapsed, toggleSidebar } = usePreferenceStore()
  const openDialog = useSearchStore(s => s.openDialog)
  const location = useLocation()

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <div className="navbar-left">
          <button className="btn-icon navbar-menu-btn" onClick={toggleSidebar}>
            <Menu size={20} />
          </button>
          <Link to="/" className="navbar-brand">
            <BookOpen size={24} />
            <span className="gradient-text">InsightHub</span>
          </Link>
        </div>

        <div className="navbar-center">
          <div className="navbar-links">
            <Link
              to="/"
              className={`navbar-link ${location.pathname === '/' ? 'active' : ''}`}
            >
              首页
            </Link>
            <Link
              to="/mindinsight"
              className={`navbar-link ${location.pathname.startsWith('/mindinsight') ? 'active' : ''}`}
            >
              MindInsight
            </Link>
            <Link
              to="/techinsight"
              className={`navbar-link ${location.pathname.startsWith('/techinsight') ? 'active' : ''}`}
            >
              TechInsight
            </Link>
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

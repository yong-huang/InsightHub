import { Outlet } from 'react-router-dom'
import { Navbar } from './Navbar'
import { Sidebar } from './Sidebar'
import { LoadingScreen } from '@/components/shared/LoadingScreen'
import { useDocumentStore } from '@/stores/documentStore'
import { usePreferenceStore } from '@/stores/preferenceStore'

export function Layout() {
  const isLoading = useDocumentStore(s => s.isLoading)
  const sidebarCollapsed = usePreferenceStore(s => s.sidebarCollapsed)

  return (
    <div className="layout">
      <Navbar />
      <div className="layout-body">
        <Sidebar />
        <main className={`layout-main${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
          {isLoading ? <LoadingScreen /> : <Outlet />}
        </main>
      </div>
    </div>
  )
}

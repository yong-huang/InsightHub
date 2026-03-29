import { Outlet } from 'react-router-dom'
import { Navbar } from './Navbar'
import { Sidebar } from './Sidebar'
import { LoadingScreen } from '@/components/shared/LoadingScreen'
import { useDocumentStore } from '@/stores/documentStore'
import '@/styles/layout.css'

export function Layout() {
  const isLoading = useDocumentStore(s => s.isLoading)

  return (
    <div className="layout">
      <Navbar />
      <div className="layout-body">
        <Sidebar />
        <main className="layout-main">
          {isLoading ? <LoadingScreen /> : <Outlet />}
        </main>
      </div>
    </div>
  )
}

import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

export function AppLayout() {
  return (
    <div className="min-h-screen bg-gray-50/80">
      <Sidebar />
      <Header />
      <main className="ml-56 pt-[56px] min-h-screen">
        <div className="p-5">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

export function AppLayout() {
  return (
    <div className="min-h-screen bg-gray-50/80">
      <Sidebar />
      <Header />
      <main className="min-h-screen min-w-0 pt-[56px] lg:ml-56">
        <div className="mx-auto w-full max-w-[1920px] min-w-0 p-3 sm:p-4 lg:p-5">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

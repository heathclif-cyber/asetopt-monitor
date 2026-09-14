import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { useState } from 'react'

export function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50/80">
      <Sidebar mobileOpen={mobileNavOpen} onNavigate={() => setMobileNavOpen(false)} />
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Tutup menu"
          className="fixed inset-0 z-30 bg-slate-950/35 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <Header onMenuClick={() => setMobileNavOpen(open => !open)} />
      <main className="min-h-screen min-w-0 pt-[56px] lg:ml-56">
        <div className="mx-auto w-full max-w-[1920px] min-w-0 p-3 sm:p-4 lg:p-5">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

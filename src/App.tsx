import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { RequireAuth } from './components/auth/RequireAuth'
import Login from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { TimelineProgram } from './pages/jalurA/TimelineProgram'
import { PotensiPendapatan } from './pages/jalurA/PotensiPendapatan'
import { KerjaSama } from './pages/jalurB/KerjaSama'
import { Kompensasi } from './pages/jalurB/Kompensasi'
import { PembayaranPBB } from './pages/jalurB/PembayaranPBB'
import { InputPembayaran } from './pages/jalurB/InputPembayaran'
import { BuatInvoice } from './pages/jalurB/BuatInvoice'
import { NotifikasiSP } from './pages/jalurB/NotifikasiSP'
import LaporanPendapatan from './pages/jalurB/LaporanPendapatan2'
import MonitoringPenagihan from './pages/jalurB/MonitoringPenagihan'
import { APP_PAGES, type AppPageKey } from './lib/navigation'
import { DataAset } from './pages/master/DataAset'
import { MasterAset } from './pages/master/MasterAset'
import { DataNJOP } from './pages/master/DataNJOP'
import { PenilaianKJPP } from './pages/master/PenilaianKJPP'
import { RKAPMonitor } from './pages/RKAPMonitor'
import { KatalogAset } from './pages/katalog/KatalogAset'
import KatalogFactsheetPage from './pages/KatalogAset'
import AdminUsers from './pages/AdminUsers'
import BuatExcel from './pages/laporan/BuatExcel'
import GISMap from './pages/GISMap'

const pageComponents: Record<AppPageKey, React.ReactNode> = {
  dashboard: <Dashboard />,
  timeline: <TimelineProgram />,
  potensi: <PotensiPendapatan />,
  kerjaSama: <KerjaSama />,
  kompensasi: <Kompensasi />,
  invoice: <BuatInvoice />,
  pembayaran: <InputPembayaran />,
  pbb: <PembayaranPBB />,
  notifikasi: <NotifikasiSP />,
  laporan: <LaporanPendapatan />,
  buatExcel: <BuatExcel />,
  monitoring: <MonitoringPenagihan mode="semua" />,
  piutang: <MonitoringPenagihan mode="piutang" />,
  masterAset: <MasterAset />,
  dataAset: <DataAset />,
  njop: <DataNJOP />,
  kjpp: <PenilaianKJPP />,
  gis: <GISMap />,
  users: <AdminUsers />,
  rkap: <RKAPMonitor />,
  katalog: <KatalogAset />,
  factsheet: <KatalogFactsheetPage />,
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          {APP_PAGES.map(page => <Route key={page.path} path={page.path} element={pageComponents[page.key]} />)}
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App

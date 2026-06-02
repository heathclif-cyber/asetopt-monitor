import { Routes, Route } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { Dashboard } from './pages/Dashboard'
import { TimelineProgram } from './pages/jalurA/TimelineProgram'
import { PotensiPendapatan } from './pages/jalurA/PotensiPendapatan'
import { KerjaSama } from './pages/jalurB/KerjaSama'
import { Kompensasi } from './pages/jalurB/Kompensasi'
import { PembayaranPBB } from './pages/jalurB/PembayaranPBB'
import { NotifikasiSP } from './pages/jalurB/NotifikasiSP'
import LaporanPendapatan from './pages/jalurB/LaporanPendapatan'
import LaporanPendapatan2 from './pages/jalurB/LaporanPendapatan2'
import { DataAset } from './pages/master/DataAset'
import { DataNJOP } from './pages/master/DataNJOP'
import { PenilaianKJPP } from './pages/master/PenilaianKJPP'
import { RKAPMonitor } from './pages/RKAPMonitor'
import { KatalogAset } from './pages/katalog/KatalogAset'
import KatalogFactsheetPage from './pages/KatalogAset'

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/jalur-a/timeline" element={<TimelineProgram />} />
        <Route path="/jalur-a/potensi" element={<PotensiPendapatan />} />
        <Route path="/jalur-b/kerja-sama" element={<KerjaSama />} />
        <Route path="/jalur-b/kompensasi" element={<Kompensasi />} />
        <Route path="/jalur-b/pbb" element={<PembayaranPBB />} />
        <Route path="/jalur-b/notifikasi" element={<NotifikasiSP />} />
        <Route path="/jalur-b/laporan" element={<LaporanPendapatan />} />
        <Route path="/jalur-b/laporan2" element={<LaporanPendapatan2 />} />
        <Route path="/master/aset" element={<DataAset />} />
        <Route path="/master/njop" element={<DataNJOP />} />
        <Route path="/master/kjpp" element={<PenilaianKJPP />} />
        <Route path="/rkap" element={<RKAPMonitor />} />
        <Route path="/katalog" element={<KatalogAset />} />
        <Route path="/katalog/factsheet" element={<KatalogFactsheetPage />} />
      </Route>
    </Routes>
  )
}

export default App

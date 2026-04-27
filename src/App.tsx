import { Routes, Route } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { Dashboard } from './pages/Dashboard'
import { TimelineProgram } from './pages/jalurA/TimelineProgram'
import { PotensiPendapatan } from './pages/jalurA/PotensiPendapatan'
import { KerjaSama } from './pages/jalurB/KerjaSama'
import { Kompensasi } from './pages/jalurB/Kompensasi'
import { PembayaranPBB } from './pages/jalurB/PembayaranPBB'
import { NotifikasiSP } from './pages/jalurB/NotifikasiSP'
import { DataAset } from './pages/master/DataAset'
import { DataNJOP } from './pages/master/DataNJOP'
import { PenilaianKJPP } from './pages/master/PenilaianKJPP'
import { RKAPMonitor } from './pages/RKAPMonitor'

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
        <Route path="/master/aset" element={<DataAset />} />
        <Route path="/master/njop" element={<DataNJOP />} />
        <Route path="/master/kjpp" element={<PenilaianKJPP />} />
        <Route path="/rkap" element={<RKAPMonitor />} />
      </Route>
    </Routes>
  )
}

export default App

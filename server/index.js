import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { pool } from './db.js'
import { migrate } from './migrate.js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }))
app.use(express.json())

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok' }))

// ─── Helper ──────────────────────────────────────────────────────────────────
const q = (text, params) => pool.query(text, params)
const ok = (res, data) => res.json({ data, error: null })
const err = (res, e, code = 400) => {
  console.error(e)
  res.status(code).json({ data: null, error: e.message ?? e })
}

// ════════════════════════════════════════════════════════════════════════════
// ASET
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/aset', async (req, res) => {
  try {
    const { rows } = await q('SELECT * FROM aset ORDER BY created_at DESC')
    ok(res, rows)
  } catch (e) { err(res, e) }
})

app.get('/api/aset/:id', async (req, res) => {
  try {
    const { rows } = await q('SELECT * FROM aset WHERE id = $1', [req.params.id])
    ok(res, rows[0] ?? null)
  } catch (e) { err(res, e) }
})

app.post('/api/aset', async (req, res) => {
  try {
    const { kode_aset, nama_aset, alamat, luas_tanah_m2, luas_bangunan_m2, status, keterangan } = req.body
    const { rows } = await q(
      `INSERT INTO aset (kode_aset, nama_aset, alamat, luas_tanah_m2, luas_bangunan_m2, status, keterangan)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [kode_aset, nama_aset, alamat, luas_tanah_m2, luas_bangunan_m2, status ?? 'pipeline', keterangan]
    )
    ok(res, rows[0])
  } catch (e) { err(res, e) }
})

app.put('/api/aset/:id', async (req, res) => {
  try {
    const { kode_aset, nama_aset, alamat, luas_tanah_m2, luas_bangunan_m2, status, keterangan } = req.body
    const { rows } = await q(
      `UPDATE aset SET kode_aset=$1, nama_aset=$2, alamat=$3, luas_tanah_m2=$4,
       luas_bangunan_m2=$5, status=$6, keterangan=$7, updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [kode_aset, nama_aset, alamat, luas_tanah_m2, luas_bangunan_m2, status, keterangan, req.params.id]
    )
    ok(res, rows[0])
  } catch (e) { err(res, e) }
})

app.delete('/api/aset/:id', async (req, res) => {
  try {
    await q('DELETE FROM aset WHERE id=$1', [req.params.id])
    ok(res, { id: req.params.id })
  } catch (e) { err(res, e) }
})

// ════════════════════════════════════════════════════════════════════════════
// NJOP
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/njop', async (req, res) => {
  try {
    const filter = req.query.aset_id ? 'WHERE aset_id=$1' : ''
    const params = req.query.aset_id ? [req.query.aset_id] : []
    const { rows } = await q(`SELECT * FROM njop ${filter} ORDER BY tahun DESC`, params)
    ok(res, rows)
  } catch (e) { err(res, e) }
})

app.post('/api/njop', async (req, res) => {
  try {
    const { aset_id, tahun, nilai_tanah_per_m2, nilai_bangunan_per_m2, sumber } = req.body
    const { rows } = await q(
      `INSERT INTO njop (aset_id, tahun, nilai_tanah_per_m2, nilai_bangunan_per_m2, sumber)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (aset_id, tahun) DO UPDATE
       SET nilai_tanah_per_m2=$3, nilai_bangunan_per_m2=$4, sumber=$5
       RETURNING *`,
      [aset_id, tahun, nilai_tanah_per_m2, nilai_bangunan_per_m2 ?? 0, sumber]
    )
    ok(res, rows[0])
  } catch (e) { err(res, e) }
})

app.put('/api/njop/:id', async (req, res) => {
  try {
    const { tahun, nilai_tanah_per_m2, nilai_bangunan_per_m2, sumber } = req.body
    const { rows } = await q(
      `UPDATE njop SET tahun=$1, nilai_tanah_per_m2=$2, nilai_bangunan_per_m2=$3, sumber=$4
       WHERE id=$5 RETURNING *`,
      [tahun, nilai_tanah_per_m2, nilai_bangunan_per_m2, sumber, req.params.id]
    )
    ok(res, rows[0])
  } catch (e) { err(res, e) }
})

app.delete('/api/njop/:id', async (req, res) => {
  try {
    await q('DELETE FROM njop WHERE id=$1', [req.params.id])
    ok(res, { id: req.params.id })
  } catch (e) { err(res, e) }
})

// ════════════════════════════════════════════════════════════════════════════
// KJPP
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/kjpp', async (req, res) => {
  try {
    const filter = req.query.aset_id ? 'WHERE aset_id=$1' : ''
    const params = req.query.aset_id ? [req.query.aset_id] : []
    const { rows } = await q(`SELECT * FROM penilaian_kjpp ${filter} ORDER BY tgl_penilaian DESC`, params)
    ok(res, rows)
  } catch (e) { err(res, e) }
})

app.post('/api/kjpp', async (req, res) => {
  try {
    const { aset_id, tgl_penilaian, nama_kjpp, no_laporan, nilai_tanah, nilai_bangunan, berlaku_hingga, keterangan } = req.body
    const { rows } = await q(
      `INSERT INTO penilaian_kjpp (aset_id, tgl_penilaian, nama_kjpp, no_laporan, nilai_tanah, nilai_bangunan, berlaku_hingga, keterangan)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [aset_id, tgl_penilaian, nama_kjpp, no_laporan, nilai_tanah, nilai_bangunan ?? 0, berlaku_hingga, keterangan]
    )
    ok(res, rows[0])
  } catch (e) { err(res, e) }
})

app.put('/api/kjpp/:id', async (req, res) => {
  try {
    const { tgl_penilaian, nama_kjpp, no_laporan, nilai_tanah, nilai_bangunan, berlaku_hingga, keterangan } = req.body
    const { rows } = await q(
      `UPDATE penilaian_kjpp SET tgl_penilaian=$1, nama_kjpp=$2, no_laporan=$3,
       nilai_tanah=$4, nilai_bangunan=$5, berlaku_hingga=$6, keterangan=$7
       WHERE id=$8 RETURNING *`,
      [tgl_penilaian, nama_kjpp, no_laporan, nilai_tanah, nilai_bangunan, berlaku_hingga, keterangan, req.params.id]
    )
    ok(res, rows[0])
  } catch (e) { err(res, e) }
})

app.delete('/api/kjpp/:id', async (req, res) => {
  try {
    await q('DELETE FROM penilaian_kjpp WHERE id=$1', [req.params.id])
    ok(res, { id: req.params.id })
  } catch (e) { err(res, e) }
})

// ════════════════════════════════════════════════════════════════════════════
// TIMELINE PROGRAM
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/timeline', async (req, res) => {
  try {
    const filter = req.query.aset_id ? 'WHERE aset_id=$1' : ''
    const params = req.query.aset_id ? [req.query.aset_id] : []
    const { rows } = await q(`SELECT * FROM timeline_program ${filter} ORDER BY urutan`, params)
    ok(res, rows)
  } catch (e) { err(res, e) }
})

app.post('/api/timeline', async (req, res) => {
  try {
    const { aset_id, nama_tahapan, urutan, tgl_target, tgl_realisasi, status, pic, kendala, tindak_lanjut } = req.body
    const { rows } = await q(
      `INSERT INTO timeline_program (aset_id, nama_tahapan, urutan, tgl_target, tgl_realisasi, status, pic, kendala, tindak_lanjut)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [aset_id, nama_tahapan, urutan, tgl_target, tgl_realisasi, status ?? 'belum', pic, kendala, tindak_lanjut]
    )
    ok(res, rows[0])
  } catch (e) { err(res, e) }
})

app.put('/api/timeline/:id', async (req, res) => {
  try {
    const { nama_tahapan, urutan, tgl_target, tgl_realisasi, status, pic, kendala, tindak_lanjut } = req.body
    const { rows } = await q(
      `UPDATE timeline_program SET nama_tahapan=$1, urutan=$2, tgl_target=$3, tgl_realisasi=$4,
       status=$5, pic=$6, kendala=$7, tindak_lanjut=$8 WHERE id=$9 RETURNING *`,
      [nama_tahapan, urutan, tgl_target, tgl_realisasi, status, pic, kendala, tindak_lanjut, req.params.id]
    )
    ok(res, rows[0])
  } catch (e) { err(res, e) }
})

app.delete('/api/timeline/:id', async (req, res) => {
  try {
    await q('DELETE FROM timeline_program WHERE id=$1', [req.params.id])
    ok(res, { id: req.params.id })
  } catch (e) { err(res, e) }
})

// ════════════════════════════════════════════════════════════════════════════
// PROSPEK MITRA
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/prospek', async (req, res) => {
  try {
    const filter = req.query.aset_id ? 'WHERE aset_id=$1' : ''
    const params = req.query.aset_id ? [req.query.aset_id] : []
    const { rows } = await q(`SELECT * FROM prospek_mitra ${filter} ORDER BY created_at DESC`, params)
    ok(res, rows)
  } catch (e) { err(res, e) }
})

app.post('/api/prospek', async (req, res) => {
  try {
    const { aset_id, nama_calon_mitra, kontak_pic, no_telepon, tgl_pendekatan, progress, catatan } = req.body
    const { rows } = await q(
      `INSERT INTO prospek_mitra (aset_id, nama_calon_mitra, kontak_pic, no_telepon, tgl_pendekatan, progress, catatan)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [aset_id, nama_calon_mitra, kontak_pic, no_telepon, tgl_pendekatan, progress ?? 'identifikasi', catatan]
    )
    ok(res, rows[0])
  } catch (e) { err(res, e) }
})

app.put('/api/prospek/:id', async (req, res) => {
  try {
    const { nama_calon_mitra, kontak_pic, no_telepon, tgl_pendekatan, progress, catatan } = req.body
    const { rows } = await q(
      `UPDATE prospek_mitra SET nama_calon_mitra=$1, kontak_pic=$2, no_telepon=$3,
       tgl_pendekatan=$4, progress=$5, catatan=$6 WHERE id=$7 RETURNING *`,
      [nama_calon_mitra, kontak_pic, no_telepon, tgl_pendekatan, progress, catatan, req.params.id]
    )
    ok(res, rows[0])
  } catch (e) { err(res, e) }
})

// ════════════════════════════════════════════════════════════════════════════
// KERJA SAMA
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/kerja-sama', async (req, res) => {
  try {
    const { rows } = await q(
      `SELECT ks.*, row_to_json(a) AS aset
       FROM kerja_sama ks
       LEFT JOIN aset a ON a.id = ks.aset_id
       ORDER BY ks.created_at DESC`
    )
    ok(res, rows)
  } catch (e) { err(res, e) }
})

app.post('/api/kerja-sama', async (req, res) => {
  try {
    const { aset_id, prospek_id, nama_mitra, no_perjanjian, tgl_mulai, tgl_selesai, status, no_wa_mitra, keterangan } = req.body
    const { rows } = await q(
      `INSERT INTO kerja_sama (aset_id, prospek_id, nama_mitra, no_perjanjian, tgl_mulai, tgl_selesai, status, no_wa_mitra, keterangan)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [aset_id, prospek_id, nama_mitra, no_perjanjian, tgl_mulai, tgl_selesai, status ?? 'aktif', no_wa_mitra, keterangan]
    )
    ok(res, rows[0])
  } catch (e) { err(res, e) }
})

app.put('/api/kerja-sama/:id', async (req, res) => {
  try {
    const { aset_id, nama_mitra, no_perjanjian, tgl_mulai, tgl_selesai, status, no_wa_mitra, keterangan } = req.body
    const { rows } = await q(
      `UPDATE kerja_sama SET aset_id=$1, nama_mitra=$2, no_perjanjian=$3,
       tgl_mulai=$4, tgl_selesai=$5, status=$6, no_wa_mitra=$7, keterangan=$8
       WHERE id=$9 RETURNING *`,
      [aset_id, nama_mitra, no_perjanjian, tgl_mulai, tgl_selesai, status, no_wa_mitra, keterangan, req.params.id]
    )
    ok(res, rows[0])
  } catch (e) { err(res, e) }
})

// ════════════════════════════════════════════════════════════════════════════
// KOMPENSASI
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/kompensasi', async (req, res) => {
  try {
    const filter = req.query.ks_id ? 'WHERE k.ks_id=$1' : ''
    const params = req.query.ks_id ? [req.query.ks_id] : []
    const { rows } = await q(
      `SELECT k.*,
         COALESCE(json_agg(p) FILTER (WHERE p.id IS NOT NULL), '[]') AS pembayaran,
         row_to_json(ks) AS kerja_sama
       FROM kompensasi k
       LEFT JOIN pembayaran p ON p.kompensasi_id = k.id
       LEFT JOIN kerja_sama ks ON ks.id = k.ks_id
       ${filter}
       GROUP BY k.id, ks.*
       ORDER BY k.tgl_jatuh_tempo`,
      params
    )
    ok(res, rows)
  } catch (e) { err(res, e) }
})

app.post('/api/kompensasi', async (req, res) => {
  try {
    const { ks_id, periode_label, nominal, ppn_persen, pph_persen, maks_hari_bayar, persen_denda_per_hari, tgl_jatuh_tempo, keterangan } = req.body
    const ppn = ppn_persen ?? 11
    const pph = pph_persen ?? 10
    const { rows } = await q(
      `INSERT INTO kompensasi (ks_id, periode_label, nominal, ppn_persen, pph_persen, maks_hari_bayar, persen_denda_per_hari, tgl_jatuh_tempo, keterangan)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [ks_id, periode_label, nominal, ppn, pph, maks_hari_bayar ?? 14, persen_denda_per_hari ?? 0.1, tgl_jatuh_tempo, keterangan]
    )
    ok(res, rows[0])
  } catch (e) { err(res, e) }
})

// ════════════════════════════════════════════════════════════════════════════
// PEMBAYARAN
// ════════════════════════════════════════════════════════════════════════════
app.post('/api/pembayaran', async (req, res) => {
  try {
    const { kompensasi_id, tgl_bayar, nominal_bayar, bukti_url, keterangan } = req.body
    const { rows } = await q(
      `INSERT INTO pembayaran (kompensasi_id, tgl_bayar, nominal_bayar, bukti_url, keterangan)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [kompensasi_id, tgl_bayar, nominal_bayar, bukti_url, keterangan]
    )
    ok(res, rows[0])
  } catch (e) { err(res, e) }
})

// ════════════════════════════════════════════════════════════════════════════
// SURAT PERINGATAN
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/surat-peringatan', async (req, res) => {
  try {
    const filter = req.query.status ? 'WHERE sp.status=$1' : ''
    const params = req.query.status ? [req.query.status] : []
    const { rows } = await q(
      `SELECT sp.*,
         json_build_object('id', ks.id, 'nama_mitra', ks.nama_mitra, 'aset',
           (SELECT row_to_json(a) FROM aset a WHERE a.id = ks.aset_id)
         ) AS kerja_sama
       FROM surat_peringatan sp
       LEFT JOIN kerja_sama ks ON ks.id = sp.ks_id
       ${filter}
       ORDER BY sp.tgl_terbit DESC`,
      params
    )
    ok(res, rows)
  } catch (e) { err(res, e) }
})

app.post('/api/surat-peringatan', async (req, res) => {
  try {
    const { ks_id, kompensasi_id, jenis, tgl_terbit, tgl_deadline, status, keterangan } = req.body
    const { rows } = await q(
      `INSERT INTO surat_peringatan (ks_id, kompensasi_id, jenis, tgl_terbit, tgl_deadline, status, keterangan)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [ks_id, kompensasi_id, jenis, tgl_terbit, tgl_deadline, status ?? 'aktif', keterangan]
    )
    ok(res, rows[0])
  } catch (e) { err(res, e) }
})

// ════════════════════════════════════════════════════════════════════════════
// PBB
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/pbb', async (req, res) => {
  try {
    const filter = req.query.aset_id ? 'WHERE p.aset_id=$1' : ''
    const params = req.query.aset_id ? [req.query.aset_id] : []
    const { rows } = await q(
      `SELECT p.*, row_to_json(a) AS aset FROM pbb p
       LEFT JOIN aset a ON a.id = p.aset_id
       ${filter} ORDER BY p.tahun DESC`,
      params
    )
    ok(res, rows)
  } catch (e) { err(res, e) }
})

app.post('/api/pbb', async (req, res) => {
  try {
    const { aset_id, tahun, nilai_pbb, tgl_jatuh_tempo } = req.body
    const { rows } = await q(
      `INSERT INTO pbb (aset_id, tahun, nilai_pbb, tgl_jatuh_tempo)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (aset_id, tahun) DO UPDATE
       SET nilai_pbb=$3, tgl_jatuh_tempo=$4
       RETURNING *`,
      [aset_id, tahun, nilai_pbb, tgl_jatuh_tempo]
    )
    ok(res, rows[0])
  } catch (e) { err(res, e) }
})

app.put('/api/pbb/:id', async (req, res) => {
  try {
    const { tahun, nilai_pbb, tgl_jatuh_tempo, status_bayar } = req.body
    const { rows } = await q(
      `UPDATE pbb SET tahun=$1, nilai_pbb=$2, tgl_jatuh_tempo=$3, status_bayar=$4
       WHERE id=$5 RETURNING *`,
      [tahun, nilai_pbb, tgl_jatuh_tempo, status_bayar, req.params.id]
    )
    ok(res, rows[0])
  } catch (e) { err(res, e) }
})

// ════════════════════════════════════════════════════════════════════════════
// LOG NOTIFIKASI
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/log-notifikasi', async (req, res) => {
  try {
    const { rows } = await q(
      `SELECT ln.*,
         json_build_object('id', ks.id, 'nama_mitra', ks.nama_mitra, 'aset',
           (SELECT row_to_json(a) FROM aset a WHERE a.id = ks.aset_id)
         ) AS kerja_sama
       FROM log_notifikasi ln
       LEFT JOIN kerja_sama ks ON ks.id = ln.ks_id
       ORDER BY ln.tgl_kirim DESC LIMIT 100`
    )
    ok(res, rows)
  } catch (e) { err(res, e) }
})

app.post('/api/log-notifikasi', async (req, res) => {
  try {
    const { ks_id, jenis, no_wa, pesan, status_kirim } = req.body
    const { rows } = await q(
      `INSERT INTO log_notifikasi (ks_id, jenis, no_wa, pesan, status_kirim)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [ks_id, jenis, no_wa, pesan, status_kirim]
    )
    ok(res, rows[0])
  } catch (e) { err(res, e) }
})

// ─── Serve React frontend ────────────────────────────────────────────────────
const distPath = join(__dirname, '../dist')
app.use(express.static(distPath))
app.get('*', (req, res) => {
  res.sendFile(join(distPath, 'index.html'))
})

// ─────────────────────────────────────────────────────────────────────────────
migrate().then(() => {
  app.listen(PORT, () => {
    console.log(`API server berjalan di http://localhost:${PORT}`)
  })
}).catch((err) => {
  console.error('Gagal start server:', err.message)
  process.exit(1)
})

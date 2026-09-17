import React from 'react'
import type { KatalogFactsheetData } from '@/types'
import { MiniMap } from './factsheet-shared'

const BLUE = '#0063bd'
const DARK_BLUE = '#004c99'
const SANS = 'Arial, Helvetica, sans-serif'

function ImageSlot({ id, label, photos, style }: { id: string; label: string; photos: Record<string, string>; style?: React.CSSProperties }) {
  const src = photos[id]
  return src ? (
    <img src={src} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', ...style }} />
  ) : (
    <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #71c0dc, #1c6c91)', color: '#fff', fontSize: 10, textAlign: 'center', padding: 10, ...style }}>{label}</div>
  )
}

function QRPlaceholder() {
  return <div style={{ width: 58, height: 58, background: '#fff', padding: 4, boxSizing: 'border-box' }}>
    <svg viewBox="0 0 58 58" width="100%" height="100%" aria-label="QR lokasi">
      <rect width="58" height="58" fill="white" />
      {[[2,2],[38,2],[2,38]].map(([x,y]) => <g key={`${x}-${y}`}><rect x={x} y={y} width="18" height="18" fill="#111"/><rect x={x+4} y={y+4} width="10" height="10" fill="#fff"/><rect x={x+7} y={y+7} width="4" height="4" fill="#111"/></g>)}
      {[23,4,29,9,23,15,30,20,39,22,47,25,23,28,29,34,39,35,46,40,23,44,31,49,40,47,49,49].map((n, i) => <rect key={i} x={n} y={[4,9,15,20,25,28,31,35,39,43,47][i % 11]} width="4" height="4" fill="#111" />)}
    </svg>
  </div>
}

export default function FactsheetCanvaLandscape({ data }: { data: KatalogFactsheetData; density?: 'compact' | 'normal' | 'spacious' }) {
  const access = data.accessibility.slice(0, 4)
  const surroundings = data.surroundings.slice(0, 6)
  const displayArea = data.landAreaHa && data.landAreaHa !== '0' ? `${data.landAreaHa} Ha` : data.landArea ? `${data.landArea} m²` : '—'

  return (
    <div style={{ width: 1040, height: 500, overflow: 'hidden', display: 'grid', gridTemplateColumns: '220px 430px 390px', background: '#fff', color: '#111', fontFamily: SANS, position: 'relative' }}>
      <aside style={{ background: `linear-gradient(180deg, ${DARK_BLUE}, ${BLUE})`, color: '#fff', padding: '18px 16px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(255,255,255,.55)', paddingBottom: 12 }}>
          <div style={{ width: 36, height: 20, borderTop: '4px solid #fff', borderRadius: '50%', transform: 'skewX(-24deg)' }} />
          <div style={{ fontSize: 8, lineHeight: 1.15, fontWeight: 700 }}>PT PERKEBUNAN<br />NUSANTARA I</div>
        </div>
        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 32, height: 32, border: '1px solid #fff', display: 'grid', placeItems: 'center', fontSize: 16 }}>⌗</div>
          <div style={{ fontSize: 13, lineHeight: .95, fontWeight: 800 }}>LAND AND<br />BUILDING<br />ASSETS</div>
        </div>
        <div style={{ marginTop: 12, background: '#fff', color: DARK_BLUE, borderRadius: 5, textAlign: 'center', padding: '4px 7px', fontWeight: 700, fontSize: 10 }}>{data.code || 'KODE ASET'}</div>
        <div style={{ marginTop: 10, height: 152, overflow: 'hidden' }}><ImageSlot id="cl-hero" label="UPLOAD FOTO UTAMA" photos={data.photos} /></div>
        <div style={{ marginTop: 18, fontSize: 16, lineHeight: 1.03, fontWeight: 800, textTransform: 'uppercase' }}>{data.name || 'NAMA ASET'}</div>
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><b>{displayArea}</b><span>{data.recommendation || data.category || 'Komersial'}</span></div>
        <div style={{ marginTop: 'auto', paddingTop: 15, fontSize: 8, display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ fontSize: 16 }}>🇬🇧</span> English Version</div>
      </aside>

      <main style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 280, position: 'relative' }}><ImageSlot id="cl-hero" label="UPLOAD FOTO UTAMA — LANDSCAPE" photos={data.photos} /></div>
        <div style={{ padding: '16px 18px 8px', display: 'grid', gridTemplateColumns: '1fr 72px', gap: 12, flex: 1 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: .3 }}>ADDRESS</div>
            <p style={{ margin: '4px 0 12px', color: '#3e3e3e', fontSize: 11, lineHeight: 1.25 }}>{data.address || 'Alamat aset'}</p>
            <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: .3 }}>CONTACT</div>
            <div style={{ marginTop: 5, fontSize: 10, lineHeight: 1.35 }}><b>{data.pic.name || 'PT Perkebunan Nusantara I (PTPN I)'}</b><br />{data.pic.mobile || data.pic.phone || '+62 8113-3333-214'}<br />{data.pic.email || 'corcom@ptpn1.co.id'}<br />{data.pic.office || 'www.ptpn1.co.id'}</div>
          </div>
          <div style={{ textAlign: 'center', fontSize: 7, fontWeight: 700, lineHeight: 1.1 }}><div>SCAN HERE</div><QRPlaceholder /><div style={{ marginTop: 3 }}>LOCATION<br />E-CATALOGUE</div></div>
        </div>
      </main>

      <section style={{ position: 'relative', overflow: 'hidden', paddingTop: 15 }}>
        <div style={{ position: 'absolute', right: 0, top: 0, width: 125, height: 90, opacity: .23, backgroundImage: 'linear-gradient(90deg, #0094d6 1px, transparent 1px), linear-gradient(#0094d6 1px, transparent 1px)', backgroundSize: '10px 10px', transform: 'rotate(-8deg)' }} />
        <div style={{ padding: '0 20px 8px', display: 'grid', gridTemplateColumns: '1fr 102px', gap: 10, position: 'relative' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: .3 }}>ACCESS <span style={{ fontSize: 9 }}>in {data.accessibility[0]?.value || '4 Km'}</span></div>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {access.length ? access.map((item, index) => <div key={index} style={{ background: BLUE, color: '#fff', borderRadius: 5, padding: '5px 8px 5px 24px', minHeight: 21, fontSize: 8, lineHeight: 1.05, position: 'relative' }}><span style={{ position: 'absolute', left: 8, top: 7, borderRadius: '50%', background: '#fff', color: DARK_BLUE, width: 11, height: 11, display: 'grid', placeItems: 'center', fontWeight: 700 }}>{['N','W','E','S'][index]}</span><b>{item.label}</b><br />{item.sub || item.value}</div>) : <div style={{ color: '#666', fontSize: 10 }}>Tambahkan data akses di form.</div>}
            </div>
          </div>
          <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}><div style={{ height: 48 }}><ImageSlot id="cl-near-1" label="FOTO 01" photos={data.photos} /></div><div style={{ height: 48 }}><ImageSlot id="cl-near-2" label="FOTO 02" photos={data.photos} /></div></div>
        </div>
        <div style={{ padding: '0 20px', display: 'grid', gridTemplateColumns: '1fr 118px', gap: 10, alignItems: 'start' }}>
          <div style={{ fontSize: 8, lineHeight: 1.45, color: '#333' }}>{surroundings.length ? surroundings.map((item, i) => <span key={i} style={{ display: 'inline-block', width: '50%' }}>{item.name}</span>) : <span>Tambahkan titik sekitar / fasilitas terdekat.</span>}</div>
          <div style={{ fontSize: 8, fontWeight: 700, lineHeight: 1.15 }}><div>{data.tagline || data.name}</div><div style={{ marginTop: 5, fontWeight: 400 }}>{data.coordinates.lat && data.coordinates.lng ? `${data.coordinates.lat}, ${data.coordinates.lng}` : 'Lokasi aset'}</div></div>
        </div>
        <div style={{ height: 240, marginTop: 8, position: 'relative' }}>
          {data.photos['cl-map'] ? <ImageSlot id="cl-map" label="PETA LOKASI" photos={data.photos} /> : <MiniMap style={{ width: '100%', height: '100%' }} label="PETA LOKASI" showLabel={false} />}
          <div style={{ position: 'absolute', left: 18, bottom: 12, background: 'rgba(255,255,255,.85)', padding: '4px 7px', fontSize: 8 }}>{data.coordinates.lat && data.coordinates.lng ? `${data.coordinates.lat}, ${data.coordinates.lng}` : 'Titik lokasi aset'}</div>
        </div>
      </section>
    </div>
  )
}

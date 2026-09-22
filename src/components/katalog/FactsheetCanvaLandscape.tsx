import { QRCodeSVG } from 'qrcode.react'
import type { CSSProperties } from 'react'
import type { KatalogFactsheetData } from '@/types'
import { accessRows, canvaBox as box, canvaPhoto, locationLink, CANVA_HEIGHT, CANVA_WIDTH } from './canva-layout'
import './factsheet-canva.css'

export { CANVA_HEIGHT, CANVA_WIDTH } from './canva-layout'
const ASSETS = '/canva/page18/'

function Asset({ name, style, className = '' }: { name: string; style: CSSProperties; className?: string }) {
  return <img src={`${ASSETS}${name}.png`} alt="" aria-hidden="true" className={`canva-asset ${className}`} style={style} />
}

function Photo({ src, label, style, className = '' }: { src?: string; label: string; style: CSSProperties; className?: string }) {
  return <div className={`canva-photo ${className}`} style={style}>
    {src ? <img src={src} alt={label} /> : <div className="canva-photo-empty">{label}<br /><small>Belum diunggah</small></div>}
  </div>
}

function FramedPhoto({ src, label, x, y, imageX, imageY, imageW, imageH }: {
  src?: string; label: string; x: number; y: number; imageX: number; imageY: number; imageW: number; imageH: number
}) {
  return <>
    <div className="canva-photo-mat" style={box(x + 20, y + 17, 338, 188)} />
    <Asset name="frame" style={box(x, y, 378.72, 222.82)} />
    <Photo src={src} label={label} style={box(imageX, imageY, imageW, imageH)} />
  </>
}

export default function FactsheetCanvaLandscape({ data }: { data: KatalogFactsheetData; density?: 'compact' | 'normal' | 'spacious' }) {
  const photo = (slot: string) => canvaPhoto(data.photos, slot)
  const rows = accessRows(data)
  const radius = data.accessibility.find(item => /^radius$/i.test(item.label.trim()))?.value
  const road = data.accessibility.find(item => /tol|toll|jalan|road/i.test(item.label))
  const roadUnit = road?.sub.match(/^(km|m|kilometer|meter)\b[\s–-]*/i)
  const locationUrl = locationLink(data)
  const catalogueUrl = typeof window === 'undefined' ? 'https://opsetreg8.my.id/katalog/factsheet' : `${window.location.origin}/katalog/factsheet`
  const contacts = [data.pic.name, data.pic.mobile || data.pic.phone, data.pic.email, data.pic.office].filter(Boolean)
  const nameSize = data.name.length > 65 ? 13 : data.name.length > 40 ? 15 : 18

  return <article className="factsheet-canva" aria-label={`Katalog ${data.name}`} style={{ width: CANVA_WIDTH, height: CANVA_HEIGHT }}>
    {/* Original Canva stacking order: map, white fades, hero, cards, identity rail. */}
    <Asset name="city-map" className="canva-paper-map" style={box(520, 810, 1700, 900)} />
    <Photo src={photo('cl-map')} label="Peta lokasi / rute" className="canva-map-photo" style={box(1755.03, 637.54, 1452.72, 902.5)} />
    <div className="canva-map-fade" style={box(1630, 560, 1488, 560)} />
    <div className="canva-contact-paper" style={box(565, 936, 850, 564)} />
    <Asset name="white-shadow" style={{ ...box(924.13, 855.28, 1409.92, 793.08), opacity: .95 }} />
    <Asset name="drop-shadow" style={{ ...box(403.83, -248.47, 1604.05, 1359.54), opacity: .25 }} />
    <Photo src={photo('cl-hero')} label="Foto utama aset" style={box(531.25, -2.42, 1305.28, 938.51)} />

    <Asset name="city-map" className="canva-city-decoration" style={box(2606.89, -365.55, 860.66, 857.53)} />
    <h2 className="canva-access-title" style={box(1837.71, 56.05, 242.38, 54.93)}>ACCESS</h2>
    {radius && <div className="canva-radius" style={box(2085.95, 48.06, 110, 70.92)}>In<br />{radius}</div>}
    {rows.map((row, i) => {
      const y = [137.74, 323.15, 508.96, 702.22][i]
      const rotation = row.marker === 'N' ? -90 : row.marker === 'S' ? 90 : row.marker === 'W' ? 180 : 0
      return <div key={i}>
        <Asset name="card-shadow" style={{ ...box(1593.34, y - 40, 628.69, 278.2), opacity: .35 }} />
        <div className="canva-access-card" style={box(1666.39, y, 615.24, 166.37)} />
        <Asset name="arrow" style={{ ...box(1585, y + 56, 126.95, 59.66), transform: `rotate(${rotation}deg)` }} />
        <Asset name="circle-shadow" style={box(1609.22, y + 37.9, 95.82, 96.3)} />
        <span className="canva-compass" style={box(1631.02, y + 50.16, 71.78, 71.78)}>{row.marker}</span>
        <div className="canva-access-copy" style={{ ...box(1718, y + 22, 538, 126), fontSize: row.text.length > 130 ? 7.4 : 8.7 }}>
          {row.text}
        </div>
      </div>
    })}

    <FramedPhoto src={photo('cl-near-1')} label="Foto lingkungan 1" x={2422.42} y={102.34} imageX={2456.55} imageY={135.42} imageW={313.53} imageH={157.15} />
    <FramedPhoto src={photo('cl-near-2')} label="Foto lingkungan 2" x={2412.63} y={343.48} imageX={2446.76} imageY={375.62} imageW={313.53} imageH={160.71} />
    {road && <div className="canva-road" style={box(2413.1, 605.94, 550, 150)}><strong>{road.label}</strong><br />{[road.value, roadUnit?.[1]].filter(Boolean).join(' ')}<br />{roadUnit ? road.sub.slice(roadUnit[0].length) : road.sub}</div>}

    <h2 className="canva-section-title" style={box(547.07, 1003.85, 378.53, 54.99)}>ADDRESS</h2>
    <div className="canva-address" style={box(640.93, 1089.25, 448.55, 112)}>{data.address || 'Alamat belum diisi'}</div>
    <h2 className="canva-section-title" style={box(573.5, 1207, 325.69, 54.99)}>CONTACT</h2>
    <div className="canva-contact" style={box(638.65, 1285.9, 475, 185)}>{contacts.length ? contacts.map((line, i) => <div key={i}>{line}</div>) : 'Kontak belum diisi'}</div>

    <div className="canva-qr-panel" style={box(1140.23, 1002.51, 247.12, 551.73)}>
      <strong>scan here</strong>
      <span>location</span>
      {locationUrl ? <a href={locationUrl} target="_blank" rel="noreferrer" aria-label="Buka lokasi aset"><QRCodeSVG value={locationUrl} size={62} marginSize={4} level="M" title="QR lokasi aset" /></a> : <div className="canva-qr-missing">Isi alamat atau koordinat</div>}
      <span>E-catalogue</span>
      <a href={catalogueUrl} aria-label="Buka e-catalogue"><QRCodeSVG value={catalogueUrl} size={62} marginSize={4} level="M" title="QR e-catalogue" /></a>
    </div>
    <FramedPhoto src={photo('cl-near-3')} label="Foto lingkungan 3" x={1418.26} y={1002.51} imageX={1452.74} imageY={1033.1} imageW={312.95} imageH={158.27} />
    <FramedPhoto src={photo('cl-near-4')} label="Foto lingkungan 4" x={1408.47} y={1243.65} imageX={1443.62} imageY={1270.66} imageW={311.41} imageH={167.65} />

    <aside className="canva-rail" style={box(0, 0, 591.37, 1500)}>
      <img src={`${ASSETS}holding-white.png`} alt="Holding Perkebunan Nusantara" className="canva-logo" style={box(57.66, 44.81, 226.21, 114.03)} />
      <img src={`${ASSETS}ptpn1-white.png`} alt="PTPN I" className="canva-logo" style={box(293.43, 44.81, 86.99, 114.03)} />
      <Asset name="building" className="canva-building-icon" style={box(76.05, 198.84, 145.87, 135.47)} />
      <div className="canva-category" style={box(241.91, 206.99, 267.22, 129.89)}>LAND AND<br />BUILDING<br />ASSETS</div>
      <div className="canva-code" style={box(56.66, 346.42, 460.27, 49.27)}>{data.code || 'Kode aset'}</div>
      <Photo src={photo('cl-portrait')} label="Foto vertikal aset" style={box(56.66, 405.23, 463.41, 666.78)} />
      <h1 className="canva-asset-name" style={{ ...box(56.66, 1165.84, 516.84, 155), fontSize: nameSize }}>{data.name || 'Nama aset'}</h1>
      <span className="canva-area" style={box(60.22, 1333.61, 185.25, 44.94)}>{data.landAreaHa || '0'} Ha</span>
      <span className="canva-recommendation" style={box(254.67, 1333.61, 292, 92)}>{data.recommendation || '—'}</span>
      <div className="canva-language" style={box(0, 1430.54, 591.37, 69.46)}><Asset name="flag" style={box(44.06, 13.38, 49.48, 34.57)} /><span style={box(100, 13.38, 278, 29.93)}>English Version</span><Asset name="flag" style={box(378.74, 11.65, 49.48, 34.57)} /></div>
    </aside>
  </article>
}

import React from 'react'
import type { KatalogFactsheetData } from '@/types'

// ---- Shared factsheet sub-components ----
// All styles are inline to match the design pixel-perfect on A4 (794x1123px @ 96dpi)

const ABBR_SERTIFIKAT: Record<string, string> = {
  'hak milik': 'HM',
  'hak guna usaha': 'HGU',
  'hak guna bangunan': 'HGB',
  'hak pengelolaan': 'HPL',
  'hak pakai': 'HP',
  'sertifikat hak milik': 'SHM',
  'sertifikat hak guna bangunan': 'SHGB',
}

export function singkatSertifikat(cert: string): string {
  if (!cert) return '—'
  const lower = cert.toLowerCase().trim()
  if (ABBR_SERTIFIKAT[lower]) return ABBR_SERTIFIKAT[lower]
  for (const [key, val] of Object.entries(ABBR_SERTIFIKAT)) {
    if (lower.includes(key)) return val
  }
  return cert.split(/[(\–—]/)[0].trim()
}

const SERIF = "'Source Serif 4', Georgia, serif"
const MONO = "'JetBrains Mono', ui-monospace, monospace"
const SANS = "'Geist', system-ui, -apple-system, sans-serif"

// CSS custom properties matching the design
const VARS = {
  paper: '#f8f5ee',
  paper2: '#efeadd',
  surface: '#ffffff',
  ink: '#1a1f1a',
  ink2: '#2a2e2a',
  muted: '#6b6f6a',
  muted2: '#8e918a',
  hair: '#d8d2c4',
  hairStrong: '#b8b1a0',
  brand: '#1e7a3d',
  brand2: '#145a2c',
  gold: '#b87a2b',
  azure: '#2c6e8f',
} as const

// ---- BrandMark ----
export function BrandMark({ small, onDark, sub = 'Regional 8 - Makassar' }: {
  small?: boolean; onDark?: boolean; sub?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <img
        src="/logo-ptpn.png"
        alt="PTPN I"
        style={{ height: small ? 22 : 28, width: 'auto', display: 'block' }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
        <span style={{
          fontFamily: SERIF, fontSize: 12, fontWeight: 600,
          color: onDark ? '#fff' : VARS.ink,
        }}>
          PT Perkebunan Nusantara I
        </span>
        <span style={{
          fontFamily: MONO, fontSize: 7.5, letterSpacing: '0.18em',
          color: onDark ? 'rgba(255,255,255,0.7)' : VARS.muted,
          textTransform: 'uppercase',
        }}>
          {sub}
        </span>
      </div>
    </div>
  )
}

// ---- PhotoSlot ----
export function PhotoSlot({ id, label = 'Foto Aset', style, photos }: {
  id: string; label?: string; style?: React.CSSProperties; photos?: Record<string, string>
}) {
  const url = photos?.[id]
  if (url) {
    return (
      <div style={{ overflow: 'hidden', ...style }}>
        <img src={url} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    )
  }
  return (
    <div style={{
      position: 'relative',
      background: 'linear-gradient(135deg, #d8d2c4 0%, #b8b1a0 100%)',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      ...style,
    }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{
          width: '100%', height: '100%',
          background: `
            repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0 12px, transparent 12px 24px),
            radial-gradient(120% 80% at 30% 30%, rgba(255,255,255,0.18), transparent 60%)
          `,
        }} />
      </div>
      <span style={{
        position: 'relative', zIndex: 2, textAlign: 'center',
        padding: '6px 10px', border: '1px dashed rgba(255,255,255,0.5)', borderRadius: 2,
        background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(2px)',
        fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em',
        textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)',
      }}>
        {label}
      </span>
    </div>
  )
}

// ---- SpecRow ----
export function SpecRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '110px 1fr', gap: 12,
      padding: '7px 0', borderBottom: `1px solid ${VARS.hair}`, alignItems: 'baseline',
    }}>
      <dt style={{
        fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.16em',
        textTransform: 'uppercase', color: VARS.muted, fontWeight: 500,
      }}>
        {label}
      </dt>
      <dd style={{ margin: 0, fontSize: 11, color: VARS.ink, fontWeight: 500 }}>
        {children}
      </dd>
    </div>
  )
}

// ---- StatTile ----
export function StatTile({ label, value, unit, sub, accent }: {
  label: string; value: string; unit?: string; sub?: string; accent?: string
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: '12px 14px', background: VARS.surface,
      border: `1px solid ${VARS.hair}`,
      ...(accent ? { borderTop: `3px solid ${accent}` } : {}),
    }}>
      <span style={{
        fontFamily: MONO, fontSize: 8, textTransform: 'uppercase',
        letterSpacing: '0.2em', color: VARS.muted,
      }}>{label}</span>
      <span style={{
        fontFamily: SERIF, fontSize: 22, fontWeight: 500,
        letterSpacing: '-0.01em', lineHeight: 1, color: VARS.ink,
      }}>
        {value}
        {unit && <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 400, color: VARS.muted, marginLeft: 3, letterSpacing: '0.08em' }}>{unit}</span>}
      </span>
      {sub && <span style={{ fontSize: 9.5, color: VARS.muted }}>{sub}</span>}
    </div>
  )
}

// ---- SectionHead ----
export function SectionHead({ num, title }: { num: string; title: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      borderTop: `1px solid ${VARS.ink}`, paddingTop: 10, marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <span style={{
          fontFamily: MONO, fontSize: 9, letterSpacing: '0.2em', color: VARS.muted,
        }}>{num}</span>
        <h3 style={{
          fontFamily: SERIF, fontSize: 16, fontWeight: 600, margin: 0,
          letterSpacing: '-0.01em',
        }}>{title}</h3>
      </div>
    </div>
  )
}

// ---- MiniMap ----
export function MiniMap({ style, label = 'LOKASI', showLabel = true }: {
  style?: React.CSSProperties; label?: string; showLabel?: boolean
}) {
  return (
    <div style={{
      position: 'relative',
      background: 'linear-gradient(180deg, #e6ead8 0%, #d6dcc4 100%)',
      overflow: 'hidden',
      ...style,
    }}>
      {/* Grid pattern */}
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <pattern id="grid60" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(30,122,61,0.1)" strokeWidth="1" />
          </pattern>
          <pattern id="grid12" width="12" height="12" patternUnits="userSpaceOnUse">
            <path d="M 12 0 L 0 0 0 12" fill="none" stroke="rgba(30,122,61,0.04)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid60)" />
        <rect width="100%" height="100%" fill="url(#grid12)" />
      </svg>
      {/* Roads + parcel */}
      <svg viewBox="0 0 200 200" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <path d="M -10 140 Q 50 120 90 130 T 210 110" stroke="#a8c4d8" strokeWidth="6" fill="none" opacity="0.7" />
        <path d="M 0 80 L 200 70" stroke="#c9b88a" strokeWidth="4" fill="none" opacity="0.85" />
        <path d="M 110 0 L 100 200" stroke="#c9b88a" strokeWidth="4" fill="none" opacity="0.85" />
        <path d="M 30 0 L 60 200" stroke="#d8c9a3" strokeWidth="2.5" fill="none" opacity="0.7" />
        <path d="M 0 30 L 200 50" stroke="#d8c9a3" strokeWidth="2.5" fill="none" opacity="0.7" />
        <path d="M 0 170 L 200 180" stroke="#d8c9a3" strokeWidth="2.5" fill="none" opacity="0.7" />
        <rect x="20" y="20" width="50" height="35" fill="rgba(30,122,61,0.06)" stroke="rgba(30,122,61,0.2)" strokeWidth="0.5" />
        <rect x="130" y="100" width="40" height="50" fill="rgba(30,122,61,0.06)" stroke="rgba(30,122,61,0.2)" strokeWidth="0.5" />
        <rect x="60" y="150" width="30" height="30" fill="rgba(30,122,61,0.06)" stroke="rgba(30,122,61,0.2)" strokeWidth="0.5" />
        <rect x="92" y="78" width="22" height="18" fill="rgba(184,122,43,0.35)" stroke="rgba(184,122,43,0.9)" strokeWidth="1" />
      </svg>
      {/* Pin */}
      <div style={{
        position: 'absolute', left: '52%', top: '44%',
        width: 18, height: 18, borderRadius: '50%',
        background: VARS.gold, border: `3px solid ${VARS.paper}`,
        boxShadow: `0 0 0 1px ${VARS.ink}, 0 4px 8px rgba(0,0,0,0.25)`,
        transform: 'translate(-50%, -50%)',
      }}>
        <div style={{
          position: 'absolute', left: '50%', top: '50%',
          width: 38, height: 38, transform: 'translate(-50%, -50%)',
          borderRadius: '50%', border: `1.5px solid ${VARS.gold}`, opacity: 0.4,
        }} />
      </div>
      {showLabel && (
        <>
          <span style={{
            position: 'absolute', left: 12, top: 12,
            fontFamily: MONO, fontSize: 8, letterSpacing: '0.1em',
            color: VARS.brand2, textTransform: 'uppercase',
          }}>{label}</span>
          <span style={{
            position: 'absolute', bottom: 6, right: 8,
            fontFamily: MONO, fontSize: 7.5, color: 'rgba(0,0,0,0.4)',
            letterSpacing: '0.1em',
          }}>5°11'11"S 119°26'01"E</span>
        </>
      )}
    </div>
  )
}

// ---- PageFooter ----
export function PageFooter({ data, page = '01 / 01', onDark }: {
  data: KatalogFactsheetData; page?: string; onDark?: boolean
}) {
  const color = onDark ? 'rgba(255,255,255,0.6)' : VARS.muted
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontFamily: MONO, fontSize: 7.5, letterSpacing: '0.16em',
      textTransform: 'uppercase', color,
    }}>
      <span>Ref. {data.documentRef}</span>
      <span>{data.documentDate}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>Hal. {page}</span>
    </div>
  )
}

// ---- CompassRose ----
export function CompassRose({ size = 28, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ color }}>
      <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.4" />
      <circle cx="16" cy="16" r="10" fill="none" stroke="currentColor" strokeWidth="0.4" opacity="0.3" />
      <path d="M 16 3 L 18 16 L 16 14 L 14 16 Z" fill="currentColor" />
      <path d="M 16 29 L 14 16 L 16 18 L 18 16 Z" fill="currentColor" opacity="0.5" />
      <path d="M 3 16 L 16 14 L 14 16 L 16 18 Z" fill="currentColor" opacity="0.5" />
      <path d="M 29 16 L 16 18 L 18 16 L 16 14 Z" fill="currentColor" opacity="0.5" />
      <text x="16" y="6" textAnchor="middle" fontSize="3.5" fontFamily="monospace" fill="currentColor" letterSpacing="0.2em">U</text>
    </svg>
  )
}

// Re-export VARS for use in variation components
export { VARS, SERIF, MONO, SANS }

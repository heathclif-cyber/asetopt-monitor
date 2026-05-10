import React from 'react'
import type { KatalogFactsheetData } from '@/types'
import { BrandMark, PhotoSlot, StatTile, SectionHead, MiniMap, PageFooter, singkatSertifikat, VARS, SERIF, MONO, SANS } from './factsheet-shared'

// Variation 2 — "Modular Grid" — tile-based, hospitality-magazine layout.
// Compact header, large hero, 4-up image grid + structured spec cards.

export default function FactsheetModular({ data, density = 'normal' }: {
  data: KatalogFactsheetData; density?: 'compact' | 'normal' | 'spacious'
}) {
  const d = density
  const scale = d === 'compact' ? 0.93 : d === 'spacious' ? 1.08 : 1

  return (
    <div style={{
      boxSizing: 'border-box', width: 794, height: 1123,
      background: VARS.paper, color: VARS.ink,
      fontFamily: SANS, fontSize: Math.round(10.5 * scale * 10) / 10, lineHeight: 1.45,
      letterSpacing: '0.005em',
      position: 'relative', overflow: 'hidden',
      backgroundImage: `
        radial-gradient(rgba(0,0,0,0.018) 1px, transparent 1px),
        radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1px)
      `,
      backgroundSize: '3px 3px, 7px 7px',
      backgroundPosition: '0 0, 1px 2px',
      padding: 24, display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      {/* ============ HEADER BAR ============ */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingBottom: 12, borderBottom: `1px solid ${VARS.ink}`,
      }}>
        <BrandMark />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '3px 9px', borderRadius: 100,
            fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.14em',
            textTransform: 'uppercase', fontWeight: 500,
            background: VARS.paper2, color: VARS.ink2,
            border: `1px solid ${VARS.hair}`,
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: VARS.brand, display: 'inline-block',
            }} />
            {data.status}
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '3px 9px', borderRadius: 100,
            fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.14em',
            textTransform: 'uppercase', fontWeight: 500,
            border: `1px solid ${VARS.ink}`, color: VARS.ink,
          }}>{data.code}</span>
        </div>
      </div>

      {/* ============ TITLE BLOCK ============ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18, alignItems: 'end' }}>
        <div>
          <div style={{
            fontFamily: MONO, fontSize: 8.5, textTransform: 'uppercase',
            letterSpacing: '0.22em', color: VARS.muted, fontWeight: 500,
            marginBottom: 6,
          }}>
            {data.category}{data.region ? ` · ${data.region}` : ''}
          </div>
          <h1 style={{
            margin: 0, fontFamily: SERIF, fontSize: 38, lineHeight: 1, fontWeight: 600,
            letterSpacing: '-0.02em',
          }}>
            {data.name}
          </h1>
          <div style={{
            marginTop: 8, fontSize: 11, color: VARS.muted2,
            maxWidth: 380, lineHeight: 1.45,
          }}>
            {data.tagline}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontFamily: MONO, fontSize: 8.5, textTransform: 'uppercase',
            letterSpacing: '0.22em', color: VARS.muted, fontWeight: 500,
          }}>Total Estimated Value</div>
          <div style={{
            fontFamily: SERIF, fontSize: 32, fontWeight: 600, lineHeight: 1,
            marginTop: 4, color: VARS.brand2,
          }}>
            {data.totalValue} <span style={{
              fontFamily: MONO, fontSize: 12, color: VARS.muted, fontWeight: 400,
              letterSpacing: '0.04em',
            }}>{data.valueUnit}</span>
          </div>
          <div style={{
            fontFamily: MONO, fontSize: 8, letterSpacing: '0.16em',
            color: VARS.muted, textTransform: 'uppercase', marginTop: 2,
          }}>
            Appraisal · {data.appraisalDate}
          </div>
        </div>
      </div>

      {/* ============ HERO + STATS ROW ============ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 10 }}>
        <PhotoSlot id="md-hero" label="FOTO UTAMA — HERO" photos={data.photos} style={{ height: 210 }} />
        <div style={{ display: 'grid', gridTemplateRows: 'repeat(4, 1fr)', gap: 6 }}>
          <StatTile label="Luas Tanah" value={data.landArea} unit="m²" sub={`± ${data.landAreaHa} ha`} accent={VARS.brand} />
          <StatTile label="Luas Bangunan" value={data.buildingArea} unit="m²" sub="Eksisting" accent={VARS.gold} />
          <StatTile label="Sertifikat" value={singkatSertifikat(data.certificate)} sub={data.certificate.split(' – ')[1] || ''} accent={VARS.azure} />
          <StatTile label="Zonasi" value="K-3" sub="Pelayanan Umum" accent={VARS.ink} />
        </div>
      </div>

      {/* ============ FOUR-UP MEDIA GRID ============ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        <PhotoSlot id="md-media-1" label="EKSTERIOR" photos={data.photos} style={{ height: 88 }} />
        <PhotoSlot id="md-media-2" label="INTERIOR / EKSISTING" photos={data.photos} style={{ height: 88 }} />
        <PhotoSlot id="md-media-3" label="AERIAL" photos={data.photos} style={{ height: 88 }} />
        <MiniMap style={{ height: 88 }} showLabel={false} />
      </div>

      {/* ============ TWO-COLUMN BODY ============ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 4 }}>
        <div>
          <SectionHead num="01" title="Spesifikasi" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0 }}>
            {([
              ['Alamat', data.address],
              ['Koordinat', `${data.coordinates.lat}, ${data.coordinates.lng}`],
              ['Sertifikat', data.certificate],
              ['Zonasi', data.zoning],
              ['Topografi', data.topography],
              ['NJOP', `${data.njop} / m²`],
            ] as const).map(([label, value], i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '110px 1fr', gap: 12,
                padding: '7px 0', borderBottom: `1px solid ${VARS.hair}`,
                alignItems: 'baseline',
              }}>
                <dt style={{
                  fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.16em',
                  textTransform: 'uppercase', color: VARS.muted, fontWeight: 500,
                }}>{label}</dt>
                <dd style={{ margin: 0, fontSize: 11, color: VARS.ink, fontWeight: 500 }}>
                  {value.includes(',') && value.match(/^-?\d+\.?\d*/) ? (
                    <span style={{ fontFamily: MONO, letterSpacing: '0.04em' }}>{value}</span>
                  ) : value}
                </dd>
              </div>
            ))}
          </div>
        </div>

        <div>
          <SectionHead num="02" title="Aksesibilitas" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {data.accessibility.map((a, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12,
                padding: '7px 0',
                borderBottom: i < data.accessibility.length - 1 ? `1px solid ${VARS.hair}` : 'none',
                alignItems: 'baseline',
              }}>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 500 }}>{a.label}</div>
                  <div style={{ fontSize: 9, color: VARS.muted }}>{a.sub}</div>
                </div>
                <div style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 600, color: VARS.ink }}>
                  {a.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ============ RECOMMENDATION + CONTACT ============ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 10, marginTop: 'auto' }}>
        <div style={{
          background: VARS.brand, color: '#fff',
          padding: '14px 18px',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{
              fontFamily: MONO, fontSize: 8.5, textTransform: 'uppercase',
              letterSpacing: '0.22em', color: 'rgba(255,255,255,0.7)', fontWeight: 500,
            }}>
              Rekomendasi Pengembangan
            </span>
            <span style={{
              fontFamily: MONO, fontSize: 8, letterSpacing: '0.18em',
              color: 'rgba(255,255,255,0.7)',
            }}>HBU ANALYSIS</span>
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600, lineHeight: 1.1 }}>
            {data.recommendation}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 2 }}>
            {data.partnershipSchemes.map((s, i) => (
              <div key={i} style={{
                padding: '8px 10px',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.25)',
              }}>
                <div style={{
                  fontFamily: MONO, fontSize: 14, fontWeight: 600,
                  letterSpacing: '0.05em',
                }}>{s.code}</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.85)' }}>{s.name}</div>
                <div style={{
                  fontFamily: MONO, fontSize: 7.5, letterSpacing: '0.1em',
                  color: 'rgba(255,255,255,0.6)', marginTop: 2,
                  textTransform: 'uppercase',
                }}>{s.note}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          background: VARS.paper2,
          border: `1px solid ${VARS.hair}`,
          padding: '14px 16px',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{
            fontFamily: MONO, fontSize: 8.5, textTransform: 'uppercase',
            letterSpacing: '0.22em', color: VARS.muted, fontWeight: 500,
          }}>Narahubung</div>
          <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 600, lineHeight: 1.15 }}>
            {data.pic.name}
          </div>
          <div style={{ fontSize: 10, color: VARS.muted2, lineHeight: 1.3 }}>
            {data.pic.title}
          </div>
          <hr style={{
            height: 1, background: VARS.hair, border: 0, margin: '4px 0',
          }} />
          <div style={{ display: 'grid', gap: 2, fontSize: 9.5 }}>
            <div>
              <span style={{ fontFamily: MONO, color: VARS.muted, fontSize: 8, letterSpacing: '0.16em' }}>TLP</span>
              &nbsp;{data.pic.phone}
            </div>
            <div>
              <span style={{ fontFamily: MONO, color: VARS.muted, fontSize: 8, letterSpacing: '0.16em' }}>HP </span>
              &nbsp;{data.pic.mobile}
            </div>
            <div>
              <span style={{ fontFamily: MONO, color: VARS.muted, fontSize: 8, letterSpacing: '0.16em' }}>EML</span>
              &nbsp;{data.pic.email}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <PageFooter data={data} />
    </div>
  )
}

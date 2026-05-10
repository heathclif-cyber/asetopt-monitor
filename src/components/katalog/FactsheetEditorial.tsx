import React from 'react'
import type { KatalogFactsheetData } from '@/types'
import { BrandMark, PhotoSlot, SpecRow, SectionHead, MiniMap, PageFooter, singkatSertifikat, VARS, SERIF, MONO, SANS } from './factsheet-shared'

// Variation 1 — "Editorial" — Premium real-estate brochure
// Cover: full-bleed photo with overlaid title; below: black stat ribbon, 2-col detail.

export default function FactsheetEditorial({ data, density = 'normal' }: {
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
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ============ COVER ============ */}
      <div style={{ position: 'relative', height: 440, flexShrink: 0 }}>
        <PhotoSlot id="ed-hero" label="FOTO UTAMA — LANDSCAPE 4:3" photos={data.photos}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, transparent 22%, transparent 50%, rgba(0,0,0,0.78) 100%)',
          pointerEvents: 'none',
        }} />

        {/* Top bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          padding: '20px 32px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          color: '#fff',
        }}>
          <BrandMark onDark />
          <div style={{ textAlign: 'right' }}>
            <div style={{
              fontFamily: MONO, fontSize: 8.5, textTransform: 'uppercase',
              letterSpacing: '0.22em', color: 'rgba(255,255,255,0.92)', fontWeight: 500,
            }}>
              Katalog Aset · {data.documentDate}
            </div>
            <div style={{
              fontFamily: MONO, fontSize: 11, marginTop: 4, color: '#fff',
              letterSpacing: '0.1em',
            }}>
              {data.code}
            </div>
          </div>
        </div>

        {/* Stamp */}
        <div style={{
          position: 'absolute', top: 88, right: 32,
          border: '1.5px solid #fff', color: '#fff',
          padding: '4px 10px 5px',
          fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.22em',
          textTransform: 'uppercase', fontWeight: 600,
          background: 'rgba(0,0,0,0.25)',
          transform: 'rotate(-4deg)',
        }}>
          {data.status}
        </div>

        {/* Cover title */}
        <div style={{ position: 'absolute', left: 32, right: 32, bottom: 28, color: '#fff' }}>
          <div style={{
            fontFamily: MONO, fontSize: 8.5, textTransform: 'uppercase',
            letterSpacing: '0.22em', marginBottom: 10,
            color: 'rgba(255,255,255,0.92)', fontWeight: 500,
          }}>
            {data.category}{data.region ? ` · ${data.region}` : ''}
          </div>
          <h1 style={{
            margin: 0, fontFamily: SERIF, fontSize: 42, lineHeight: 0.98, fontWeight: 500,
            letterSpacing: '-0.02em', maxWidth: 540,
          }}>
            {data.name}
          </h1>
          <div style={{
            marginTop: 10, fontFamily: SERIF, fontSize: 13, fontStyle: 'italic',
            color: 'rgba(255,255,255,0.88)', maxWidth: 520, lineHeight: 1.4,
          }}>
            {data.tagline}
          </div>
        </div>
      </div>

      {/* ============ STAT RIBBON ============ */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0,
        background: VARS.ink, color: '#fff',
      }}>
        {[
          { label: 'Luas Tanah', value: data.landArea, unit: 'm²' },
          { label: 'Luas Bangunan', value: data.buildingArea, unit: 'm²' },
          { label: 'Sertifikat', value: singkatSertifikat(data.certificate), unit: '' },
          { label: 'Nilai Aset', value: data.totalValue, unit: data.valueUnit },
        ].map((s, i) => (
          <div key={i} style={{
            padding: '14px 18px',
            borderRight: i < 3 ? '1px solid rgba(255,255,255,0.12)' : 'none',
          }}>
            <div style={{
              fontFamily: MONO, fontSize: 8, letterSpacing: '0.22em',
              textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)',
            }}>{s.label}</div>
            <div style={{
              fontFamily: SERIF, fontSize: 22, fontWeight: 500, lineHeight: 1, marginTop: 6,
            }}>
              {s.value}
              {s.unit && <span style={{
                fontFamily: MONO, fontSize: 10, marginLeft: 4,
                color: 'rgba(255,255,255,0.6)',
              }}>{s.unit}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* ============ BODY ============ */}
      <div style={{
        padding: '16px 32px 0',
        display: 'grid',
        gridTemplateColumns: '1.3fr 1fr',
        gap: 24,
        flex: 1,
        minHeight: 0,
      }}>
        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <SectionHead num="01" title="Spesifikasi Aset" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0 }}>
              <SpecRow label="Alamat">{data.address}</SpecRow>
              <SpecRow label="Koordinat">
                <span style={{ fontFamily: MONO, letterSpacing: '0.04em' }}>
                  {data.coordinates.lat}, {data.coordinates.lng}
                </span>
              </SpecRow>
              <SpecRow label="Sertifikat">{data.certificate}</SpecRow>
              <SpecRow label="Zonasi">{data.zoning}</SpecRow>
              <SpecRow label="Topografi">{data.topography}</SpecRow>
              <SpecRow label="NJOP / m²">{data.njop}</SpecRow>
              <SpecRow label="Penilaian">{data.appraisalSource} · {data.appraisalDate}</SpecRow>
            </div>
          </div>

          <div>
            <SectionHead num="02" title="Rekomendasi Pengembangan" />
            <div style={{
              background: VARS.brand, color: '#fff',
              padding: '12px 16px',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <div style={{
                fontFamily: MONO, fontSize: 8.5, textTransform: 'uppercase',
                letterSpacing: '0.22em', color: 'rgba(255,255,255,0.7)', fontWeight: 500,
              }}>
                Highest & Best Use
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 600, lineHeight: 1.1 }}>
                {data.recommendation}
              </div>
              <div style={{ fontSize: 10, lineHeight: 1.5, color: 'rgba(255,255,255,0.92)' }}>
                {data.recommendationSummary}
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 2 }}>
                {data.partnershipSchemes.map((s, i) => (
                  <span key={i} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '3px 9px', borderRadius: 100,
                    fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.14em',
                    textTransform: 'uppercase', fontWeight: 500,
                    background: 'rgba(255,255,255,0.15)', color: '#fff',
                    border: '1px solid rgba(255,255,255,0.4)',
                  }}>
                    {s.code} · {s.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <PhotoSlot id="ed-aerial" label="FOTO UDARA / DRONE" photos={data.photos}
            style={{ width: '100%', height: 140 }} />

          <div>
            <SectionHead num="03" title="Lokasi" />
            <MiniMap style={{ width: '100%', height: 130 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 10 }}>
              {data.accessibility.slice(0, 4).map((a, i) => (
                <div key={i} style={{ borderTop: `1px solid ${VARS.hair}`, paddingTop: 6 }}>
                  <div style={{
                    fontFamily: MONO, fontSize: 7.5, letterSpacing: '0.16em',
                    textTransform: 'uppercase', color: VARS.muted,
                  }}>{a.label}</div>
                  <div style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 500, marginTop: 1 }}>
                    {a.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ============ BOTTOM STRIP ============ */}
      <div style={{
        padding: '12px 32px 10px',
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr) 1.4fr', gap: 8,
        flexShrink: 0,
      }}>
        <PhotoSlot id="ed-thumb-1" label="FOTO 02" photos={data.photos} style={{ height: 84 }} />
        <PhotoSlot id="ed-thumb-2" label="FOTO 03" photos={data.photos} style={{ height: 84 }} />
        <PhotoSlot id="ed-thumb-3" label="FOTO 04" photos={data.photos} style={{ height: 84 }} />
        <div style={{
          height: 84, padding: '8px 12px',
          border: `1px solid ${VARS.ink}`,
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          background: VARS.paper2,
        }}>
          <div style={{
            fontFamily: MONO, fontSize: 8.5, textTransform: 'uppercase',
            letterSpacing: '0.22em', color: VARS.muted, fontWeight: 500,
          }}>Narahubung</div>
          <div>
            <div style={{ fontFamily: SERIF, fontSize: 12, fontWeight: 600, lineHeight: 1.15 }}>
              {data.pic.name}
            </div>
            <div style={{ fontSize: 8.5, color: VARS.muted, marginTop: 1 }}>
              {data.pic.title}
            </div>
          </div>
          <div style={{
            fontFamily: MONO, fontSize: 8, letterSpacing: '0.06em', color: VARS.ink,
          }}>
            {data.pic.mobile} · {data.pic.email}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '0 32px 12px', flexShrink: 0 }}>
        <PageFooter data={data} />
      </div>
    </div>
  )
}

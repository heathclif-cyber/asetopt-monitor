import React from 'react'
import type { KatalogFactsheetData } from '@/types'
import { BrandMark, PhotoSlot, SpecRow, SectionHead, PageFooter, CompassRose, VARS, SERIF, MONO, SANS } from './factsheet-shared'

// Variation 3 — "Compact Datasheet" — engineering-grade dense factsheet.
// Vertical split: photo column (left, 300px) + data column (right, flex).

export default function FactsheetCompact({ data, density = 'normal' }: {
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
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', height: '100%' }}>
        {/* ============ LEFT: PHOTO COLUMN ============ */}
        <div style={{
          background: VARS.ink, color: '#fff',
          display: 'flex', flexDirection: 'column',
          padding: '20px 18px', gap: 10,
        }}>
          <BrandMark onDark sub="Aset · Kerjasama" small />

          <div style={{ marginTop: 4 }}>
            <div style={{
              fontFamily: MONO, fontSize: 8.5, textTransform: 'uppercase',
              letterSpacing: '0.22em', color: 'rgba(255,255,255,0.92)', fontWeight: 500,
            }}>Asset Datasheet</div>
            <div style={{
              fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em',
              color: 'rgba(255,255,255,0.7)', marginTop: 2,
            }}>{data.code}</div>
          </div>

          <PhotoSlot id="cp-hero" label="HERO" photos={data.photos} style={{ height: 230, width: '100%' }} />

          <div>
            <div style={{
              fontFamily: MONO, fontSize: 8.5, textTransform: 'uppercase',
              letterSpacing: '0.22em', color: VARS.gold, fontWeight: 500,
              marginBottom: 6,
            }}>{data.category}</div>
            <h1 style={{
              margin: 0, fontFamily: SERIF, fontSize: 26, lineHeight: 1, fontWeight: 600,
              letterSpacing: '-0.015em',
            }}>{data.name}</h1>
            <div style={{
              fontSize: 9.5, color: 'rgba(255,255,255,0.7)', marginTop: 6, lineHeight: 1.4,
            }}>
              {data.address}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginTop: 4 }}>
            <PhotoSlot id="cp-thumb-1" label="02" photos={data.photos} style={{ height: 60 }} />
            <PhotoSlot id="cp-thumb-2" label="03" photos={data.photos} style={{ height: 60 }} />
            <PhotoSlot id="cp-thumb-3" label="04" photos={data.photos} style={{ height: 60 }} />
          </div>

          <PhotoSlot id="cp-aerial" label="AERIAL VIEW" photos={data.photos} style={{ height: 110, width: '100%' }} />

          <div style={{
            border: '1px solid rgba(255,255,255,0.2)',
            padding: '8px 10px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{
              fontFamily: MONO, fontSize: 8, letterSpacing: '0.16em',
              color: 'rgba(255,255,255,0.55)',
            }}>COORD</div>
            <div style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 500 }}>
              {data.coordinates.lat}, {data.coordinates.lng}
            </div>
            <CompassRose size={20} color="rgba(255,255,255,0.7)" />
          </div>

          <div style={{ flex: 1 }} />

          <div style={{
            fontFamily: MONO, fontSize: 7.5, letterSpacing: '0.16em',
            color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase',
            display: 'flex', justifyContent: 'space-between',
          }}>
            <span>Hal. 01 / 01</span>
            <span>{data.documentDate}</span>
          </div>
        </div>

        {/* ============ RIGHT: DATA COLUMN ============ */}
        <div style={{ padding: '20px 26px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Top meta */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '3px 9px', borderRadius: 100,
                fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.14em',
                textTransform: 'uppercase', fontWeight: 500,
                background: VARS.brand, color: '#fff',
              }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: '#fff', display: 'inline-block',
                }} />
                {data.status}
              </span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '3px 9px', borderRadius: 100,
                fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.14em',
                textTransform: 'uppercase', fontWeight: 500,
                background: VARS.paper2, color: VARS.ink2,
                border: `1px solid ${VARS.hair}`,
              }}>{data.category}</span>
            </div>
            <div style={{
              fontFamily: MONO, fontSize: 8, letterSpacing: '0.18em',
              color: VARS.muted, textTransform: 'uppercase',
            }}>
              Ref. {data.documentRef}
            </div>
          </div>

          {/* Headline value strip */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
            border: `1px solid ${VARS.ink}`, background: VARS.paper2,
          }}>
            {[
              { l: 'Luas Tanah', v: data.landArea, u: 'm²' },
              { l: 'Luas Bangunan', v: data.buildingArea, u: 'm²' },
              { l: 'NJOP / m²', v: (data.njop || '').replace('Rp ', ''), u: 'IDR' },
              { l: 'Nilai Aset', v: (data.totalValue || '').replace('Rp ', ''), u: data.valueUnit.toUpperCase() },
            ].map((s, i) => (
              <div key={i} style={{
                padding: '10px 12px',
                borderRight: i < 3 ? `1px solid ${VARS.hairStrong}` : 'none',
              }}>
                <div style={{
                  fontFamily: MONO, fontSize: 7.5, letterSpacing: '0.18em',
                  textTransform: 'uppercase', color: VARS.muted,
                }}>{s.l}</div>
                <div style={{
                  fontFamily: SERIF, fontSize: 17, fontWeight: 600, lineHeight: 1, marginTop: 4,
                }}>
                  {s.v}
                  <span style={{
                    fontFamily: MONO, fontSize: 8.5, color: VARS.muted,
                    marginLeft: 4, fontWeight: 400, letterSpacing: '0.04em',
                  }}>{s.u}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Two-column dense data */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <div>
              <SectionHead num="01" title="Spesifikasi" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0 }}>
                {([
                  ['Sertifikat', data.certificate],
                  ['Pemegang', data.certificateOwner],
                  ['Zonasi', data.zoning],
                  ['Topografi', data.topography],
                  ['Bangunan', data.buildingCondition],
                  ['Penilai', data.appraisalSource],
                  ['Tgl. Penilaian', data.appraisalDate],
                ] as const).map(([label, value], i) => (
                  <SpecRow key={i} label={label}>{value}</SpecRow>
                ))}
              </div>
            </div>
            <div>
              <SectionHead num="02" title="Aksesibilitas" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0 }}>
                {data.accessibility.map((a, i) => (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '110px 1fr', gap: 12,
                    padding: '7px 0', borderBottom: `1px solid ${VARS.hair}`,
                    alignItems: 'baseline',
                  }}>
                    <dt style={{
                      fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.16em',
                      textTransform: 'uppercase', color: VARS.muted, fontWeight: 500,
                    }}>{a.label}</dt>
                    <dd style={{ margin: 0, fontSize: 11, color: VARS.ink, fontWeight: 500 }}>
                      <span style={{ fontFamily: SERIF, fontSize: 12, fontWeight: 600 }}>{a.value}</span>
                      <div style={{ fontSize: 9, color: VARS.muted, fontWeight: 400 }}>{a.sub}</div>
                    </dd>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Surroundings */}
          <div>
            <SectionHead num="03" title="Lingkungan Sekitar" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
              {data.surroundings.map((s, i) => (
                <div key={i} style={{
                  padding: '8px 10px',
                  background: VARS.surface,
                  border: `1px solid ${VARS.hair}`,
                  borderTop: `2px solid ${VARS.azure}`,
                }}>
                  <div style={{
                    fontFamily: MONO, fontSize: 7, letterSpacing: '0.16em',
                    textTransform: 'uppercase', color: VARS.muted,
                  }}>{s.type}</div>
                  <div style={{ fontSize: 9.5, fontWeight: 500, lineHeight: 1.2, marginTop: 3 }}>
                    {s.name}
                  </div>
                  <div style={{
                    fontFamily: MONO, fontSize: 9, color: VARS.brand,
                    marginTop: 4, fontWeight: 600, letterSpacing: '0.04em',
                  }}>
                    {s.distance}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recommendation */}
          <div>
            <SectionHead num="04" title="Rekomendasi & Skema Kerjasama" />
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
              <div style={{
                background: VARS.ink, color: '#fff',
                padding: '12px 14px',
              }}>
                <div style={{
                  fontFamily: MONO, fontSize: 8.5, textTransform: 'uppercase',
                  letterSpacing: '0.22em', color: VARS.gold, fontWeight: 500,
                }}>
                  Highest & Best Use
                </div>
                <div style={{
                  fontFamily: SERIF, fontSize: 18, fontWeight: 600, marginTop: 4,
                  lineHeight: 1.1,
                }}>
                  {data.recommendation}
                </div>
                <div style={{
                  fontSize: 9.5, color: 'rgba(255,255,255,0.8)',
                  marginTop: 6, lineHeight: 1.45,
                }}>
                  {data.recommendationSummary}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {data.partnershipSchemes.map((s, i) => (
                  <div key={i} style={{
                    padding: '8px 10px',
                    border: `1px solid ${VARS.ink}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <div style={{
                        fontFamily: MONO, fontSize: 11, fontWeight: 700,
                        letterSpacing: '0.05em',
                      }}>{s.code}</div>
                      <div style={{ fontSize: 8.5, color: VARS.muted }}>{s.name}</div>
                    </div>
                    <div style={{
                      fontFamily: MONO, fontSize: 7.5, letterSpacing: '0.12em',
                      color: VARS.muted, textTransform: 'uppercase',
                    }}>{s.note}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Contact strip */}
          <div style={{
            marginTop: 'auto', borderTop: `2px solid ${VARS.ink}`,
            paddingTop: 10,
          }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14,
              alignItems: 'center',
            }}>
              <div>
                <div style={{
                  fontFamily: MONO, fontSize: 8.5, textTransform: 'uppercase',
                  letterSpacing: '0.22em', color: VARS.muted, fontWeight: 500,
                }}>Narahubung</div>
                <div style={{
                  fontFamily: SERIF, fontSize: 13, fontWeight: 600, marginTop: 2,
                }}>{data.pic.name}</div>
                <div style={{ fontSize: 8.5, color: VARS.muted }}>{data.pic.title}</div>
              </div>
              <div style={{
                fontFamily: MONO, fontSize: 9, letterSpacing: '0.04em',
                lineHeight: 1.5,
              }}>
                <div>{data.pic.phone}</div>
                <div>{data.pic.mobile}</div>
                <div style={{ color: VARS.brand }}>{data.pic.email}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{
                  fontFamily: MONO, fontSize: 8.5, textTransform: 'uppercase',
                  letterSpacing: '0.22em', color: VARS.muted, fontWeight: 500,
                }}>Kantor</div>
                <div style={{ fontSize: 9.5, marginTop: 2 }}>{data.pic.office}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useState, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { scanSiteFonts, type SiteFont } from '@/lib/site-fonts'
import {
  applyRefont,
  getFontOverride,
  resetAllRefonts,
  resetRefont,
  type ReplacementFont,
} from '@/lib/site-refont'
import { GoogleFontPicker } from './GoogleFontPicker'

/* Stroke icons copied from the Fonts board (24px grid). */
function Icon({
  size,
  width = 2,
  children,
}: {
  size: number
  width?: number
  children: ReactNode
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

const RescanIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" />
    <path d="M21 3v5h-5" />
  </svg>
)

const MONO_GENERICS = new Set(['monospace', 'ui-monospace'])

const pluralEl = (n: number) => `${n} ${n === 1 ? 'element' : 'elements'}`

/* Website-wide font overview: every font family the page's text renders in,
   with a usage %, an element count, and a global replace control. Replacing a
   family rewrites the font-family of every element using it (see
   site-refont.ts) — only the family, never size/weight/spacing; Reset restores
   the originals. */
export function SiteFontOverview() {
  const [fonts, setFonts] = useState<SiteFont[]>(() => scanSiteFonts())
  // Bumped after any edit/reset so getFontOverride(...) is re-read on render.
  const [, setTick] = useState(0)
  const bump = () => setTick((t) => t + 1)
  // Which font row has its Google Fonts picker expanded.
  const [openKey, setOpenKey] = useState<string | null>(null)
  // Which font is mid-apply (webfont downloading) — disables that row's picker.
  const [applying, setApplying] = useState<{ key: string; family: string } | null>(null)

  // Rescan reads the page fresh — revert overrides first so it re-reads the
  // original typography rather than the replaced one.
  const rescan = () => {
    resetAllRefonts()
    setFonts(scanSiteFonts())
    setOpenKey(null)
    bump()
  }
  const resetEverything = () => {
    resetAllRefonts()
    bump()
  }

  const onPick = (font: SiteFont, gf: ReplacementFont) => {
    setApplying({ key: font.key, family: gf.family })
    void applyRefont(font, gf).finally(() => {
      setApplying(null)
      bump()
    })
  }
  const onReset = (key: string) => {
    resetRefont(key)
    bump()
  }

  if (fonts.length === 0) {
    return (
      <div className="sfp-overview">
        <div className="sfp-summary">
          <span>No fonts detected</span>
          <button type="button" className="sfp-btn" onClick={rescan} title="Re-scan the page">
            <RescanIcon />
            Rescan
          </button>
        </div>
        <div className="sfp-empty">No fonts detected on this page</div>
      </div>
    )
  }

  const anyOverride = fonts.some((f) => getFontOverride(f.key) != null)
  const totalElements = fonts.reduce((n, f) => n + f.elementCount, 0)

  return (
    <div className="sfp-overview">
      <div className="sfp-summary">
        <span>
          <span className="sfp-mono sfp-strong">{fonts.length}</span>{' '}
          {fonts.length === 1 ? 'family' : 'families'} ·{' '}
          <span className="sfp-mono sfp-strong">{totalElements}</span>{' '}
          {totalElements === 1 ? 'element' : 'elements'}
        </span>
        <span className="sfp-summary-actions">
          {anyOverride && (
            <button
              type="button"
              className="sfp-btn"
              onClick={resetEverything}
              title="Revert all font changes"
            >
              <RotateCcw size={13} aria-hidden="true" />
              Reset all
            </button>
          )}
          <button type="button" className="sfp-btn" onClick={rescan} title="Re-scan the page">
            <RescanIcon />
            Rescan
          </button>
        </span>
      </div>

      {fonts.map((f) => {
        const override = getFontOverride(f.key)
        const open = openKey === f.key
        const isApplying = applying?.key === f.key
        const mono = MONO_GENERICS.has(f.key)
        const sampleFamily = f.isGeneric ? f.family : `"${f.family}"`
        return (
          <div
            className={'sfp-entry' + (open ? ' open' : '')}
            key={f.key}
          >
            <div className="sfp-fam-head">
              <button
                type="button"
                className="sfp-toggle"
                aria-expanded={open}
                aria-label={`${f.family}, ${f.pct}% of text, ${pluralEl(f.elementCount)}${
                  override != null ? `, replaced with ${override}` : ''
                }`}
                title="Choose a replacement font"
                onClick={() => setOpenKey((k) => (k === f.key ? null : f.key))}
              >
                <span
                  className="sfp-sample"
                  style={{ fontFamily: sampleFamily }}
                  aria-hidden="true"
                >
                  Aa
                </span>
                <span className="sfp-meta">
                  <span className="sfp-name-line">
                    <span className={'sfp-name' + (mono ? ' sfp-mono' : '')}>{f.family}</span>
                    {f.isGeneric && <span className="sfp-tag">generic</span>}
                    {!f.isGeneric && !f.loaded && <span className="sfp-tag">fallback</span>}
                    {override != null && (
                      <span className="sfp-over sfp-mono">→ {override}</span>
                    )}
                  </span>
                  <span className="sfp-usage">
                    <span className="sfp-bar">
                      <span
                        className="sfp-fill"
                        style={{ width: `${Math.min(100, f.pct)}%` }}
                      />
                    </span>
                    <span className="sfp-pct sfp-mono">{f.pct}%</span>
                    <span className="sfp-el">{f.elementCount} el.</span>
                  </span>
                </span>
                {isApplying ? (
                  <span className="sfp-spin" role="status" aria-label="Applying font">
                    <Icon size={16}>
                      <path d="M21 12a9 9 0 1 1-6.2-8.56" />
                    </Icon>
                  </span>
                ) : (
                  <span className="sfp-chev" aria-hidden="true">
                    <Icon size={16}>
                      <path d={open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
                    </Icon>
                  </span>
                )}
              </button>
              {override != null && !open && !isApplying && (
                <button
                  type="button"
                  className="sfp-revert-icon"
                  onClick={() => onReset(f.key)}
                  title="Revert this font"
                  aria-label={`Revert ${f.family}`}
                >
                  <RotateCcw size={14} aria-hidden="true" />
                </button>
              )}
            </div>
            {open && (
              <GoogleFontPicker
                current={override}
                disabled={isApplying}
                onPick={(gf) => onPick(f, gf)}
                header={
                  isApplying || override != null ? (
                    <div className="sfp-preview">
                      <div className="sfp-preview-status" role="status">
                        <span className={'sfp-dot' + (isApplying ? ' busy' : '')} />
                        {isApplying
                          ? `Loading ${applying?.family ?? 'font'}…`
                          : `Previewing on ${pluralEl(f.elementCount)}`}
                      </div>
                      {override != null && (
                        <div
                          className="sfp-preview-sample"
                          style={{ fontFamily: `"${override}", sans-serif` }}
                        >
                          Understand any website
                        </div>
                      )}
                      <div className="sfp-preview-swap">
                        <span className="sfp-mono sfp-preview-from">{f.family}</span>
                        <Icon size={12} width={2.2}>
                          <path d="M5 12h14M13 6l6 6-6 6" />
                        </Icon>
                        <span className="sfp-mono sfp-preview-to">
                          {isApplying ? applying?.family : override}
                        </span>
                        {override != null && (
                          <button
                            type="button"
                            className="sfp-revert"
                            disabled={isApplying}
                            onClick={() => onReset(f.key)}
                          >
                            Revert
                          </button>
                        )}
                      </div>
                    </div>
                  ) : undefined
                }
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

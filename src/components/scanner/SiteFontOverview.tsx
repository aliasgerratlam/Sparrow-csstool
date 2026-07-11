import { useState } from 'react'
import { ChevronDown, Loader2, RotateCcw, RefreshCw } from 'lucide-react'
import { scanSiteFonts, type SiteFont } from '@/lib/site-fonts'
import {
  applyRefont,
  getFontOverride,
  resetAllRefonts,
  resetRefont,
  type ReplacementFont,
} from '@/lib/site-refont'
import { GoogleFontPicker } from './GoogleFontPicker'

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
  const [applyingKey, setApplyingKey] = useState<string | null>(null)

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
    setApplyingKey(font.key)
    void applyRefont(font, gf).finally(() => {
      setApplyingKey(null)
      bump()
    })
  }
  const onReset = (key: string) => {
    resetRefont(key)
    bump()
  }

  if (fonts.length === 0) {
    return (
      <div className="site-overview">
        <div className="site-toolbar">
          <button type="button" className="site-tool-btn" onClick={rescan}>
            <RefreshCw size={12} /> Rescan
          </button>
        </div>
        <div className="dropper-empty">No fonts detected on this page</div>
      </div>
    )
  }

  const anyOverride = fonts.some((f) => getFontOverride(f.key) != null)

  return (
    <div className="site-overview">
      <div className="site-toolbar">
        <div className="site-toolbar-actions">
          {anyOverride && (
            <button
              type="button"
              className="site-tool-btn"
              onClick={resetEverything}
              title="Revert all font changes"
            >
              <RotateCcw size={12} /> Reset all
            </button>
          )}
          <button
            type="button"
            className="site-tool-btn"
            onClick={rescan}
            title="Re-scan the page"
          >
            <RefreshCw size={12} /> Rescan
          </button>
        </div>
      </div>

      <p className="site-hint">
        Click a font to pick a replacement — a Google Font or your own font
        file — only the family changes, sizes and weights stay.
      </p>

      {fonts.map((f) => {
        const override = getFontOverride(f.key)
        const open = openKey === f.key
        const applying = applyingKey === f.key
        return (
          <div className="sfont-entry" key={f.key}>
            <div
              className={'sfont-row' + (open ? ' open' : '')}
              onClick={(e) => {
                if ((e.target as Element).closest('.site-reset-btn')) return
                setOpenKey((k) => (k === f.key ? null : f.key))
              }}
              title="Click to choose a replacement font"
            >
              <span className="sfont-meta">
                <span className="sfont-name-line">
                  <span
                    className="sfont-name"
                    style={{ fontFamily: f.isGeneric ? f.family : `"${f.family}"` }}
                  >
                    {f.family}
                  </span>
                  {f.isGeneric && <span className="sfont-tag">generic</span>}
                  {!f.isGeneric && !f.loaded && (
                    <span className="sfont-tag">fallback</span>
                  )}
                  {override != null && (
                    <span className="sfont-override">→ {override}</span>
                  )}
                </span>
                <span className="site-usage">
                  <span className="site-usage-bar">
                    <span
                      className="site-usage-fill"
                      style={{ width: `${Math.min(100, f.pct)}%` }}
                    />
                  </span>
                  <span className="site-usage-pct">{f.pct}%</span>
                  <span className="site-count-pill">
                    {f.elementCount} {f.elementCount === 1 ? 'element' : 'elements'}
                  </span>
                </span>
              </span>
              {applying ? (
                <span className="sfont-spinner" aria-label="Applying font">
                  <Loader2 size={14} />
                </span>
              ) : override != null ? (
                <button
                  type="button"
                  className="site-reset-btn"
                  onClick={() => onReset(f.key)}
                  title="Revert this font"
                  aria-label="Revert this font"
                >
                  <RotateCcw size={13} />
                </button>
              ) : (
                <span className={'sfont-chevron' + (open ? ' open' : '')} aria-hidden="true">
                  <ChevronDown size={14} />
                </span>
              )}
            </div>
            {open && (
              <GoogleFontPicker
                current={override}
                disabled={applying}
                onPick={(gf) => onPick(f, gf)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

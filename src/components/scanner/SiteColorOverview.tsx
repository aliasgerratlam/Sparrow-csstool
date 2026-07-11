import { useState } from 'react'
import { RotateCcw, RefreshCw } from 'lucide-react'
import {
  convertColorTokens,
  formatRgba,
  type ColorFormat,
} from '@/lib/color'
import { scanSiteColors, type ColorCategory, type SiteColor } from '@/lib/site-colors'
import {
  applyRecolor,
  getOverride,
  resetAll,
  resetRecolor,
} from '@/lib/site-recolor'
import { SiteColorHighlight } from './SiteColorHighlight'

/* Website-wide color overview: every solid color the page paints, grouped into
   named categories with a usage %, an element count, and a global edit control.
   Editing a color rewrites every element/property painting it (see
   site-recolor.ts); Reset restores the originals. */
export function SiteColorOverview({ format }: { format: ColorFormat }) {
  const [categories, setCategories] = useState<ColorCategory[]>(() => scanSiteColors())
  // Bumped after any edit/reset so getOverride(...) is re-read on render.
  const [, setTick] = useState(0)
  const bump = () => setTick((t) => t + 1)
  // Bumped only on reset/rescan — the color <input>s are keyed on it so they
  // remount (and pick up their reset default) then, but NOT on every live edit,
  // which would remount and close the native picker mid-drag.
  const [resetNonce, setResetNonce] = useState(0)
  const bumpReset = () => setResetNonce((n) => n + 1)
  // Which color's elements are outlined on the page (click a tile to toggle).
  const [highlightKey, setHighlightKey] = useState<string | null>(null)

  // Rescan reads the page fresh — revert overrides first so it re-reads the
  // original palette rather than the recolored one.
  const rescan = () => {
    resetAll()
    setCategories(scanSiteColors())
    bumpReset()
    bump()
  }
  const resetEverything = () => {
    resetAll()
    bumpReset()
    bump()
  }

  const onEdit = (color: SiteColor, hex: string) => {
    applyRecolor(color, hex)
    bump()
  }
  const onReset = (key: string) => {
    resetRecolor(key)
    bumpReset()
    bump()
  }

  // Click a tile to outline its elements; click the swatch/reset controls does
  // their own thing (guarded here so those clicks don't also toggle highlight).
  const onTileClick = (c: SiteColor, e: React.MouseEvent) => {
    const t = e.target as Element
    if (t.closest('.site-swatch') || t.closest('.site-reset-btn')) return
    setHighlightKey((k) => (k === c.key ? null : c.key))
  }

  // Canonical string for the value column — keep alpha via rgba() when present.
  const canonical = (c: SiteColor): string =>
    c.rgba[3] < 255
      ? formatRgba(c.rgba[0], c.rgba[1], c.rgba[2], c.rgba[3])
      : c.hex

  if (categories.length === 0) {
    return (
      <div className="site-overview">
        <div className="site-toolbar">
          <button type="button" className="site-tool-btn" onClick={rescan}>
            <RefreshCw size={12} /> Rescan
          </button>
        </div>
        <div className="dropper-empty">No colors detected on this page</div>
      </div>
    )
  }

  // Flat, usage-ordered list (categories drive ordering but aren't labelled).
  const colors = categories.flatMap((cat) => cat.colors)
  const anyOverride = colors.some((c) => getOverride(c.key) != null)

  // Distinct elements of the highlighted color (if any), for the outline layer.
  const activeColor = highlightKey ? colors.find((c) => c.key === highlightKey) : null
  const activeElements = activeColor
    ? Array.from(new Set(activeColor.usages.map((u) => u.el)))
    : []

  return (
    <div className="site-overview">
      <div className="site-toolbar">
        <div className="site-toolbar-actions">
          {anyOverride && (
            <button
              type="button"
              className="site-tool-btn"
              onClick={resetEverything}
              title="Revert all color edits"
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
        Click a color to highlight where it's used · click its swatch to recolor.
      </p>

      {colors.map((c) => {
        const override = getOverride(c.key)
        const shownColor = override ?? canonical(c)
        const value = convertColorTokens(override ?? canonical(c), format)
        // The native picker needs a 6-digit hex; overrides are captured as hex.
        const inputHex = override ?? c.hex
        const highlighted = highlightKey === c.key
        return (
          <div
            className={'site-color-row' + (highlighted ? ' highlighted' : '')}
            key={c.key}
            onClick={(e) => onTileClick(c, e)}
            title="Click to highlight the elements using this color"
          >
            <span className="site-swatch">
              <span className="site-swatch-fill" style={{ background: shownColor }} />
              <input
                // Uncontrolled: the native picker owns its value while open; we
                // only remount it (via the reset-nonce key) on reset so a
                // controlled `value` never fights the picker mid-drag.
                key={`${c.key}:${resetNonce}`}
                type="color"
                className="site-color-input"
                defaultValue={inputHex}
                onChange={(e) => onEdit(c, e.target.value)}
                title="Edit this color everywhere"
                aria-label={`Edit ${value}`}
              />
            </span>
            <span className="site-color-meta">
              <span className="site-color-value" title={value}>
                {value}
              </span>
              <span className="site-usage">
                <span className="site-usage-bar">
                  <span
                    className="site-usage-fill"
                    style={{ width: `${Math.min(100, c.pct)}%` }}
                  />
                </span>
                <span className="site-usage-pct">{c.pct}%</span>
                <span className="site-count-pill">
                  {c.elementCount} {c.elementCount === 1 ? 'element' : 'elements'}
                </span>
              </span>
            </span>
            {override != null && (
              <button
                type="button"
                className="site-reset-btn"
                onClick={() => onReset(c.key)}
                title="Revert this color"
                aria-label="Revert this color"
              >
                <RotateCcw size={13} />
              </button>
            )}
          </div>
        )
      })}

      {activeElements.length > 0 && <SiteColorHighlight elements={activeElements} />}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import {
  COLOR_FORMATS,
  convertColorTokens,
  formatRgba,
  type ColorFormat,
} from '@/lib/color'
import { copyToClipboard } from '@/lib/clipboard'
import { scanSiteColors, type SiteColor } from '@/lib/site-colors'
import {
  applyRecolor,
  getOverride,
  resetAll,
  resetRecolor,
} from '@/lib/site-recolor'
import { colorName } from './color-name'
import { SiteColorHighlight } from './SiteColorHighlight'

/* Swap choices offered under "Try a different color" (the design's palette). */
const SWAP_CHOICES = ['#7c3aed', '#0f766e', '#dc2626', '#f59e0b', '#09090b']
/* Segments drawn in the palette-at-a-glance bar (most used first). */
const MAX_SEGMENTS = 12
const FORMAT_LABEL: Record<ColorFormat, string> = { hex: 'HEX', rgba: 'RGB', hsl: 'HSL' }

/* Bars/segments for near-white colors would vanish on the light track. */
function isLight(rgba: readonly number[]): boolean {
  const [r, g, b] = rgba as [number, number, number]
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.82
}

/* Website-wide color overview: every solid color the page paints, most used
   first, with a usage %, an element count, a copy control and a site-wide swap.
   Picking a swap color previews it everywhere (inline `!important` overrides,
   see site-recolor.ts); "Swap everywhere" keeps it, collapsing the card or
   leaving the panel drops an unkept preview, and Undo restores the originals. */
export function SiteColorOverview({
  format,
  formatLocked,
  onFormatChange,
  onClose,
  onHeadPointerDown,
}: {
  format: ColorFormat
  formatLocked: boolean
  onFormatChange: (f: ColorFormat) => void
  onClose: () => void
  onHeadPointerDown: (e: React.PointerEvent) => void
}) {
  const [scan, setScan] = useState<SiteColor[]>(() => sortByUsage(scanSiteColors()))
  // Bumped after any edit/reset so getOverride(...) is re-read on render.
  const [, setTick] = useState(0)
  const bump = () => setTick((t) => t + 1)
  // Bumped only on reset/rescan — the custom color <input> is keyed on it so it
  // remounts (and picks up its reset default) then, but NOT on every live edit,
  // which would remount and close the native picker mid-drag.
  const [resetNonce, setResetNonce] = useState(0)
  // Which color is expanded / outlined on the page (click a card or segment).
  const [activeKey, setActiveKey] = useState<string | null>(null)
  // Color keys whose swap the user has kept. A swap that isn't kept is only a
  // preview and is dropped when its card collapses or the panel closes.
  const keptRef = useRef(new Set<string>())
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const copyTimer = useRef<number | undefined>(undefined)

  const scanRef = useRef(scan)
  scanRef.current = scan

  useEffect(
    () => () => {
      window.clearTimeout(copyTimer.current)
      // Panel closing: drop previews that were never kept (kept swaps persist
      // across modes, like the old behaviour; Scanner reverts on disable).
      for (const c of scanRef.current) {
        if (getOverride(c.key) != null && !keptRef.current.has(c.key)) resetRecolor(c.key)
      }
    },
    [],
  )
  const colors = scan

  // Rescan reads the page fresh — revert overrides first so it re-reads the
  // original palette rather than the recolored one.
  const rescan = () => {
    resetAll()
    keptRef.current.clear()
    setActiveKey(null)
    setScan(sortByUsage(scanSiteColors()))
    setResetNonce((n) => n + 1)
    bump()
  }
  const resetEverything = () => {
    resetAll()
    keptRef.current.clear()
    setResetNonce((n) => n + 1)
    bump()
  }

  // Select a card/segment (toggle). Collapsing or moving away from a card drops
  // its un-kept preview.
  const select = (key: string) => {
    const prev = activeKey
    if (prev && prev !== key && getOverride(prev) != null && !keptRef.current.has(prev)) {
      resetRecolor(prev)
      setResetNonce((n) => n + 1)
    }
    if (prev === key && getOverride(key) != null && !keptRef.current.has(key)) {
      resetRecolor(key)
      setResetNonce((n) => n + 1)
    }
    setActiveKey(prev === key ? null : key)
    bump()
  }

  const preview = (c: SiteColor, hex: string) => {
    keptRef.current.delete(c.key)
    applyRecolor(c, hex)
    bump()
  }
  const keep = (c: SiteColor) => {
    if (getOverride(c.key) == null) return
    keptRef.current.add(c.key)
    bump()
  }
  const undo = (c: SiteColor) => {
    resetRecolor(c.key)
    keptRef.current.delete(c.key)
    setResetNonce((n) => n + 1)
    bump()
  }

  const copy = async (key: string, text: string) => {
    if (!(await copyToClipboard(text))) return
    window.clearTimeout(copyTimer.current)
    setCopiedKey(key)
    copyTimer.current = window.setTimeout(() => setCopiedKey(null), 1400)
  }

  // Canonical string for the value column — keep alpha via rgba() when present.
  const canonical = (c: SiteColor): string =>
    c.rgba[3] < 255 ? formatRgba(c.rgba[0], c.rgba[1], c.rgba[2], c.rgba[3]) : c.hex

  const anyOverride = colors.some((c) => getOverride(c.key) != null)

  // Distinct elements of the active color (if any), for the outline layer.
  const activeColor = activeKey ? colors.find((c) => c.key === activeKey) : null
  const activeElements = activeColor
    ? Array.from(new Set(activeColor.usages.map((u) => u.el)))
    : []

  const header = (
    <header id="dropper-head" className="sp-col-head" onPointerDown={onHeadPointerDown}>
      <div className="sp-col-head-text">
        <h2 className="sp-col-title">Colors on this page</h2>
        <p className="sp-col-sub">
          {colors.length > 0 ? (
            <>
              <strong>
                {colors.length} {colors.length === 1 ? 'color' : 'colors'}
              </strong>{' '}
              found, most used first
              {anyOverride && (
                <>
                  {' · '}
                  <button type="button" className="sp-col-link" onClick={resetEverything}>
                    Reset all
                  </button>
                </>
              )}
            </>
          ) : (
            'No colors detected'
          )}
        </p>
      </div>
      <button
        type="button"
        className="sp-col-btn sp-col-ghost sp-col-icon-btn"
        aria-label="Scan the page again"
        title="Scan again"
        onClick={rescan}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
      </button>
      <button
        type="button"
        className="sp-col-btn sp-col-ghost sp-col-icon-btn"
        aria-label="Close colors"
        onClick={onClose}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </header>
  )

  if (colors.length === 0) {
    return (
      <>
        {header}
        <p className="sp-col-empty">No colors detected on this page</p>
      </>
    )
  }

  const segments = colors.slice(0, MAX_SEGMENTS)

  return (
    <>
      {header}

      {/* palette at a glance: each block selects its color */}
      <div className="sp-col-palette-wrap">
        <div role="group" aria-label="Palette overview" className="sp-col-palette">
          {segments.map((c) => {
            const shown = getOverride(c.key) ?? canonical(c)
            return (
              <button
                key={c.key}
                type="button"
                className={'sp-col-btn sp-col-seg' + (activeKey === c.key ? ' is-active' : '')}
                aria-label={`Select ${colorName(c.rgba)} ${c.hex}`}
                aria-pressed={activeKey === c.key}
                title={`${colorName(c.rgba)} ${c.hex}`}
                style={{ flexGrow: Math.max(c.pct, 3), background: shown }}
                onClick={() => select(c.key)}
              />
            )
          })}
        </div>
      </div>

      {/* how it works + format */}
      <div className="sp-col-hintrow">
        <div className="sp-col-hint">
          <span className="sp-col-hint-ico" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4l7 17 2.5-7.5L21 11z" />
            </svg>
          </span>
          Pick a color to see where it's used
        </div>
        <div
          role="group"
          aria-label="Color code format"
          className={'sp-col-format' + (formatLocked ? ' locked' : '')}
          title={formatLocked ? 'Upgrade to switch color format' : undefined}
        >
          {COLOR_FORMATS.map((f) => {
            const locked = formatLocked && f !== 'hex'
            return (
              <button
                key={f}
                type="button"
                className={'sp-col-btn sp-col-fmt' + (format === f ? ' is-active' : '') + (locked ? ' locked' : '')}
                aria-pressed={format === f}
                aria-disabled={locked || undefined}
                onClick={() => onFormatChange(f)}
              >
                {FORMAT_LABEL[f]}
                {locked && (
                  <svg className="sp-col-lock" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* list */}
      <div className="sp-col-list">
        {colors.map((c) => {
          const active = activeKey === c.key
          const override = getOverride(c.key)
          const kept = keptRef.current.has(c.key)
          const shown = override ?? canonical(c)
          const value = convertColorTokens(override ?? canonical(c), format)
          const copied = copiedKey === c.key
          const itemLabel = c.elementCount === 1 ? 'item' : 'items'
          const isPreset = override != null && SWAP_CHOICES.includes(override.toLowerCase())
          const isCustom = override != null && !isPreset
          return (
            <div
              key={c.key}
              className={'sp-col-card' + (active ? ' is-active' : '')}
              data-active={active}
            >
              <div className="sp-col-card-row">
                <button
                  type="button"
                  className="sp-col-btn sp-col-card-main"
                  aria-pressed={active}
                  onClick={() => select(c.key)}
                >
                  <span
                    className="sp-col-swatch sp-col-swatch-lg"
                    style={{ ['--sp-col' as string]: shown }}
                  />
                  <span className="sp-col-card-meta">
                    <span className="sp-col-card-top">
                      <span className="sp-col-name">{colorName(c.rgba)}</span>
                      <span className="sp-col-value" title={value}>
                        {value}
                      </span>
                    </span>
                    <span className="sp-col-card-usage">
                      <span className="sp-col-bar">
                        <span
                          className="sp-col-bar-fill"
                          style={{
                            width: `${Math.max(2, Math.min(100, c.pct))}%`,
                            background: isLight(c.rgba) && override == null ? '#a1a1aa' : shown,
                          }}
                        />
                      </span>
                      <span className="sp-col-usage-text">
                        <strong>{c.pct < 1 ? '<1%' : `${c.pct}%`}</strong> · {c.elementCount} {itemLabel}
                      </span>
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className={'sp-col-btn sp-col-ghost sp-col-copy' + (copied ? ' is-copied' : '')}
                  aria-label={`Copy ${value}`}
                  title="Copy code"
                  onClick={() => copy(c.key, value)}
                >
                  {copied ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="9" y="9" width="12" height="12" rx="2" />
                      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                    </svg>
                  )}
                </button>
              </div>

              {active && (
                <div className="sp-col-expand">
                  <div className="sp-col-note">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    <span>
                      Glowing on the page now: <strong>{c.elementCount} {itemLabel}</strong> use this color
                    </span>
                  </div>

                  <div className="sp-col-swap">
                    <div className="sp-col-swap-head">
                      <span className="sp-col-swap-title">Try a different color</span>
                      <span className="sp-col-pro">PRO</span>
                    </div>
                    <div className="sp-col-swap-sub">
                      Preview a swap across the whole page. Only you see it.
                    </div>
                    <div className="sp-col-swap-pick">
                      <span
                        className="sp-col-swatch sp-col-swatch-sm"
                        style={{ ['--sp-col' as string]: canonical(c) }}
                      />
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                      <div role="radiogroup" aria-label="New color" className="sp-col-choices">
                        {SWAP_CHOICES.map((hex) => {
                          const on = override?.toLowerCase() === hex
                          return (
                            <button
                              key={hex}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              aria-label={`Swap to ${hex}`}
                              className={'sp-col-btn sp-col-sw' + (on ? ' is-active' : '')}
                              style={{ ['--sp-col' as string]: hex }}
                              onClick={() => preview(c, hex)}
                            />
                          )
                        })}
                        {/* The native color input sits invisibly over the dashed
                            button so clicking it opens the platform picker. */}
                        <label
                          className={'sp-col-btn sp-col-ghost sp-col-custom' + (isCustom ? ' is-active' : '')}
                          style={isCustom ? { ['--sp-col' as string]: override } : undefined}
                          title="Pick a custom color"
                        >
                          {!isCustom && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                              <path d="M12 5v14M5 12h14" />
                            </svg>
                          )}
                          <input
                            // Uncontrolled: the native picker owns its value while
                            // open; only remounted (nonce key) on reset/rescan.
                            key={`${c.key}:${resetNonce}`}
                            type="color"
                            className="sp-col-custom-input"
                            defaultValue={override ?? c.hex}
                            aria-label="Pick a custom color"
                            onChange={(e) => preview(c, e.target.value)}
                          />
                        </label>
                      </div>
                    </div>
                    <div className="sp-col-swap-actions">
                      <button
                        type="button"
                        className="sp-col-btn sp-col-primary"
                        disabled={override == null || kept}
                        onClick={() => keep(c)}
                      >
                        Swap everywhere
                      </button>
                      <button
                        type="button"
                        className="sp-col-btn sp-col-ghost sp-col-undo"
                        disabled={override == null}
                        onClick={() => undo(c)}
                      >
                        Undo
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {activeElements.length > 0 && <SiteColorHighlight elements={activeElements} />}
    </>
  )
}

/* Most-used first, flattened out of the scan's named categories. */
function sortByUsage(categories: ReturnType<typeof scanSiteColors>): SiteColor[] {
  return categories
    .flatMap((cat) => cat.colors)
    .sort((a, b) => b.usages.length - a.usages.length)
}

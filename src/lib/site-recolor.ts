import { COLOR_TOKEN, parseCssColor } from './color'
import type { SiteColor } from './site-colors'

/* ─────────────────────────────────────────────────────────────────────────
   Global recolor — apply a new color to every element/property that currently
   paints a given site color, and revert cleanly. Mirrors preview.ts: snapshot
   the inline value before writing, restore (or remove) it on reset. Overrides
   live only as inline styles, so they never touch author stylesheets and undo
   is exact.

   Solid single-color properties are set directly. box-shadow carries its color
   as one token among offsets/blur, so only the matching token is rewritten.
───────────────────────────────────────────────────────────────────────── */

interface Snapshot {
  el: HTMLElement | SVGElement
  prop: string
  prev: string
}

const active = new Map<string, Snapshot[]>()
const overrides = new Map<string, string>()

/** Rewrite only the color tokens in `value` that resolve to `targetKey`. */
function replaceMatchingTokens(
  value: string,
  targetKey: string,
  newCss: string,
): string {
  return value.replace(COLOR_TOKEN, (tok) => {
    const rgba = parseCssColor(tok)
    return rgba && rgba.join(',') === targetKey ? newCss : tok
  })
}

function styleOf(el: Element): CSSStyleDeclaration | null {
  const s = (el as HTMLElement).style
  return s && typeof s.setProperty === 'function' ? s : null
}

/* Apply `newCss` to every usage of `color`. Re-applying for the same color key
   first reverts the previous override so repeated edits stay exact. */
export function applyRecolor(color: SiteColor, newCss: string): void {
  resetRecolor(color.key)

  const snaps: Snapshot[] = []
  const seen = new Set<string>() // el+prop, so a color used twice on one prop is written once

  for (const { el, prop } of color.usages) {
    if (!el.isConnected) continue // node was removed since the scan
    const style = styleOf(el)
    if (!style) continue
    // A stable per-element id keeps the seen-set cheap without touching the DOM.
    const marker = `${prop}`
    const dedupeKey = markerFor(el) + '|' + marker
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    // Set with `important` priority so the override reliably wins over author
    // rules (incl. ones declared `!important` and Tailwind utilities). Without
    // this, elements whose color is set by an `!important` rule never change.
    if (prop === 'box-shadow') {
      const cur = getComputedStyle(el).boxShadow
      const rewritten = replaceMatchingTokens(cur, color.key, newCss)
      if (rewritten === cur) continue
      snaps.push({ el: el as HTMLElement, prop, prev: style.getPropertyValue(prop) })
      style.setProperty(prop, rewritten, 'important')
    } else {
      snaps.push({ el: el as HTMLElement, prop, prev: style.getPropertyValue(prop) })
      style.setProperty(prop, newCss, 'important')
    }
  }

  active.set(color.key, snaps)
  overrides.set(color.key, newCss)
}

/* Weak identity for dedupe within a single applyRecolor pass. */
let markerSeq = 0
const markerMap = new WeakMap<Element, string>()
function markerFor(el: Element): string {
  let m = markerMap.get(el)
  if (!m) {
    m = String(markerSeq++)
    markerMap.set(el, m)
  }
  return m
}

/** Revert the override for one color key. */
export function resetRecolor(key: string): void {
  const snaps = active.get(key)
  if (!snaps) return
  for (const { el, prop, prev } of snaps) {
    if (prev) el.style.setProperty(prop, prev)
    else el.style.removeProperty(prop)
  }
  active.delete(key)
  overrides.delete(key)
}

/** Revert every override (e.g. when the scanner is disabled). */
export function resetAll(): void {
  Array.from(active.keys()).forEach(resetRecolor)
}

/** The color currently overriding `key`, or null if none. */
export function getOverride(key: string): string | null {
  return overrides.get(key) ?? null
}

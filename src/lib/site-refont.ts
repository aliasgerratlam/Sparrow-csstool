import { isCustomFont, type CustomFont } from './custom-fonts'
import { genericFallbackFor, loadGoogleFont, type GoogleFont } from './google-fonts'
import type { SiteFont } from './site-fonts'

/** Anything the Fonts tool can swap a site font for. */
export type ReplacementFont = GoogleFont | CustomFont

/* ─────────────────────────────────────────────────────────────────────────
   Global refont — swap the font-family of every element that uses a given
   site font, and revert cleanly. Mirrors site-recolor.ts: snapshot the inline
   value before writing, restore (or remove) it on reset. Overrides live only
   as inline styles, so they never touch author stylesheets and undo is exact.

   Only font-family is ever written — size, weight, line-height and every
   other typography property stay whatever the author set. Each element keeps
   its own original fallback tail (minus the replaced family) so missing
   glyphs degrade the same way they did before.

   Known limitations: pseudo-element (::before/::after/::placeholder) text is
   not overridden, and content added after the scan needs a Rescan.
───────────────────────────────────────────────────────────────────────── */

interface Snapshot {
  el: HTMLElement | SVGElement
  prev: string
}

const active = new Map<string, Snapshot[]>() // SiteFont.key → snapshots
const overrides = new Map<string, string>() // SiteFont.key → new family name

function styleOf(el: Element): CSSStyleDeclaration | null {
  const s = (el as HTMLElement).style
  return s && typeof s.setProperty === 'function' ? s : null
}

/* Apply `gf` to every usage of `font`. The webfont is awaited first (bounded
   — see loadGoogleFont) so the swap lands all at once instead of flashing
   fallbacks; custom uploads were already registered via FontFace at upload
   time, so there is nothing to fetch. Re-applying for the same key first
   reverts the previous override so repeated edits stay exact (and read
   original stacks, not our own). */
export async function applyRefont(font: SiteFont, gf: ReplacementFont): Promise<void> {
  if (!isCustomFont(gf)) await loadGoogleFont(gf)
  resetRefont(font.key)

  const snaps: Snapshot[] = []
  for (const el of font.elements) {
    if (!el.isConnected) continue // node was removed since the scan
    const style = styleOf(el)
    if (!style) continue

    // New family first, then the element's own tail so per-element fallbacks
    // survive the swap; elements with no tail get the category's generic.
    const stack = getComputedStyle(el).fontFamily
    const tail = stack
      .split(',')
      .slice(1)
      .map((t) => t.trim())
      .filter(Boolean)
    const value = `"${gf.family}", ${tail.length ? tail.join(', ') : genericFallbackFor(gf.category)}`

    snaps.push({
      el: el as HTMLElement,
      prev: style.getPropertyValue('font-family'),
    })
    // `important` so the override reliably wins over author rules (incl. ones
    // declared !important and Tailwind utilities) — same as site-recolor.
    style.setProperty('font-family', value, 'important')
  }

  active.set(font.key, snaps)
  overrides.set(font.key, gf.family)
}

/** Revert the override for one font key. */
export function resetRefont(key: string): void {
  const snaps = active.get(key)
  if (!snaps) return
  for (const { el, prev } of snaps) {
    if (prev) el.style.setProperty('font-family', prev)
    else el.style.removeProperty('font-family')
  }
  active.delete(key)
  overrides.delete(key)
}

/** Revert every override (e.g. when the scanner is disabled). */
export function resetAllRefonts(): void {
  Array.from(active.keys()).forEach(resetRefont)
}

/** The family currently overriding `key`, or null if none. */
export function getFontOverride(key: string): string | null {
  return overrides.get(key) ?? null
}

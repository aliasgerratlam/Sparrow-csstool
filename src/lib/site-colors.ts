import { COLOR_TOKEN, formatHex, parseCssColor, rgbToHsl } from './color'

/* ─────────────────────────────────────────────────────────────────────────
   Site-wide color scan — walk the whole inspected page, aggregate every solid
   color it paints (and which element/property paints it), then bucket the
   colors into named categories (Primary/Secondary/Accent by usage, plus
   Success/Warning/Error by hue, and Neutrals). Framework-agnostic: it only
   reads getComputedStyle, so Chrome and Firefox return the same result.

   Gradients and Tailwind class resolution are intentionally out of scope here
   (the per-element Element-Colors view still covers those) — the overview
   aggregates the resting solid colors that dominate a page's palette.
───────────────────────────────────────────────────────────────────────── */

/** One place a color is painted — the element and the CSS property. */
export interface ColorUsage {
  el: Element
  prop: string
}

/** An aggregated color across the whole page. */
export interface SiteColor {
  key: string // rgba.join(',') — the aggregation key
  rgba: [number, number, number, number]
  hex: string
  pct: number // share of all color usages, 0–100
  elementCount: number // distinct elements painting this color
  usages: ColorUsage[]
}

export interface ColorCategory {
  name: string
  colors: SiteColor[]
}

/* Scanner/annotation chrome to skip so the overview reflects the page, not our
   own UI. Matches the known chrome roots plus any element whose class list
   starts with a chrome prefix (scanner-/annot-/dropper-/sfont-). Shared with
   the site-wide font scan (site-fonts.ts). Note: the font panel uses the
   `sfont-` prefix precisely so this can't match Tailwind `font-*` utilities
   on the inspected page. `.site-hl-layer` is the color-usage highlight overlay
   (SiteColorHighlight) — it's portalled to <body>, so it lives OUTSIDE the
   panel roots above; without excluding it here, a Rescan while a color is
   highlighted re-scans our own outline boxes (their #c81e5a border/fill leak
   in as phantom page colors). */
export const CHROME_SELECTOR =
  '#scanner-toolbar,#scanner-panel,#scanner-dropper-panel,#scanner-font-panel,' +
  '#scanner-assets-panel,' +
  '#mode-rail,#scanner-highlight,#scanner-selected,#ruler-overlay,' +
  '#annot-pin-layer,#annot-card,#panel-hierarchy-tip,.site-hl-layer,' +
  '[class^="scanner-"],' +
  '[class^="annot-"],[class^="dropper-"],[class^="sfont-"],[class^="sassets-"]'

const SIDES = ['top', 'right', 'bottom', 'left'] as const

/* Single-color properties whose entire value resolves to one color. box-shadow
   is handled separately (its color is one token among many). */
function isDrawnSide(cs: CSSStyleDeclaration, side: string): boolean {
  const width = parseFloat(cs.getPropertyValue(`border-${side}-width`)) || 0
  const style = cs.getPropertyValue(`border-${side}-style`)
  return width > 0 && style !== 'none' && style !== 'hidden'
}

/* Does the element hold its own visible text (so its `color` is actually
   painted, not just inherited by an empty wrapper)? Keeps text-color counts
   meaningful instead of tagging every div on the page. */
function hasDirectText(el: Element): boolean {
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim())
      return true
  }
  return false
}

interface Bucket {
  rgba: [number, number, number, number]
  elements: Set<Element>
  usages: ColorUsage[]
}

/* Collect every solid color an element paints, keyed by resolved rgba. */
function collectElementColors(
  el: Element,
  cs: CSSStyleDeclaration,
  add: (colorStr: string, prop: string) => void,
): void {
  add(cs.backgroundColor, 'background-color')
  if (hasDirectText(el)) add(cs.color, 'color')

  for (const side of SIDES) {
    if (isDrawnSide(cs, side))
      add(cs.getPropertyValue(`border-${side}-color`), `border-${side}-color`)
  }

  if (cs.outlineStyle !== 'none' && (parseFloat(cs.outlineWidth) || 0) > 0)
    add(cs.outlineColor, 'outline-color')

  if (el instanceof SVGElement) {
    add(cs.fill, 'fill')
    add(cs.stroke, 'stroke')
  }

  // box-shadow may carry a color token among offsets/blur — count each token.
  for (const tok of cs.boxShadow.match(COLOR_TOKEN) ?? []) add(tok, 'box-shadow')
}

// ── Categorization ──────────────────────────────────────────────────────────

/* A color is "neutral" (gray / near-black / near-white) when it carries little
   actual color. We measure raw chroma (max−min channel), NOT HSL saturation:
   dark grays like #111827 read as highly "saturated" in HSL (s≈39%) even though
   they're perceptually gray, so an HSL-saturation test wrongly keeps them out of
   Neutrals. Chroma separates grays from brand colors cleanly at any lightness. */
function isNeutral(rgba: [number, number, number, number]): boolean {
  const chroma = Math.max(rgba[0], rgba[1], rgba[2]) - Math.min(rgba[0], rgba[1], rgba[2])
  return chroma < 40 // 0–255 scale (~16%)
}

type SemanticName = 'Success' | 'Warning' | 'Error'

/* Hue bands (degrees) for status colors. A chromatic color falling in a band
   (and saturated enough to read as that status) can fill the slot. */
function semanticForHue(rgba: [number, number, number, number]): SemanticName | null {
  const { h, s } = rgbToHsl(rgba[0], rgba[1], rgba[2])
  if (s < 25) return null
  if (h < 15 || h >= 345) return 'Error'
  if (h >= 30 && h < 70) return 'Warning'
  if (h >= 80 && h < 170) return 'Success'
  return null
}

/* Walk the page and return colors grouped into ordered categories. Categories
   with no colors are omitted by the caller. */
export function scanSiteColors(): ColorCategory[] {
  const root = document.body
  if (!root) return []

  const buckets = new Map<string, Bucket>()
  let totalUsages = 0

  const all = Array.from(root.querySelectorAll('*'))
  for (const el of all) {
    if (el.closest(CHROME_SELECTOR)) continue
    let cs: CSSStyleDeclaration
    try {
      cs = getComputedStyle(el)
    } catch {
      continue
    }
    if (cs.display === 'none') continue

    const add = (colorStr: string, prop: string): void => {
      if (!colorStr || colorStr === 'none') return
      const rgba = parseCssColor(colorStr)
      if (!rgba || rgba[3] === 0) return // unresolvable or fully transparent
      const key = rgba.join(',')
      let bucket = buckets.get(key)
      if (!bucket) {
        bucket = { rgba, elements: new Set(), usages: [] }
        buckets.set(key, bucket)
      }
      bucket.elements.add(el)
      bucket.usages.push({ el, prop })
      totalUsages++
    }

    collectElementColors(el, cs, add)
  }

  if (!totalUsages) return []

  // Materialize SiteColors, sorted by usage (most-used first).
  const colors: SiteColor[] = Array.from(buckets.values())
    .map((b) => ({
      key: b.rgba.join(','),
      rgba: b.rgba,
      hex: formatHex(b.rgba[0], b.rgba[1], b.rgba[2]),
      pct: Math.round((b.usages.length / totalUsages) * 100),
      elementCount: b.elements.size,
      usages: b.usages,
    }))
    .sort((a, b) => b.usages.length - a.usages.length)

  const neutrals = colors.filter((c) => isNeutral(c.rgba))
  const chromatic = colors.filter((c) => !isNeutral(c.rgba))

  // Top-3 chromatic by usage → brand slots.
  const primary = chromatic[0]
  const secondary = chromatic[1]
  const accent = chromatic[2]
  const rest = chromatic.slice(3)

  // Status slots: most-used remaining color in each hue band.
  const semantic: Record<SemanticName, SiteColor | undefined> = {
    Success: undefined,
    Warning: undefined,
    Error: undefined,
  }
  const other: SiteColor[] = []
  for (const c of rest) {
    const sem = semanticForHue(c.rgba)
    if (sem && !semantic[sem]) semantic[sem] = c
    else other.push(c)
  }

  const categories: ColorCategory[] = [
    { name: 'Primary', colors: primary ? [primary] : [] },
    { name: 'Secondary', colors: secondary ? [secondary] : [] },
    { name: 'Accent', colors: accent ? [accent] : [] },
    { name: 'Success', colors: semantic.Success ? [semantic.Success] : [] },
    { name: 'Warning', colors: semantic.Warning ? [semantic.Warning] : [] },
    { name: 'Error', colors: semantic.Error ? [semantic.Error] : [] },
    { name: 'Neutrals', colors: neutrals },
    { name: 'Other', colors: other },
  ]

  return categories.filter((c) => c.colors.length > 0)
}

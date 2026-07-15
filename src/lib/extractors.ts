import { cascadeSort, getMatchedRules } from './cssom'
import type { Dimensions, MatchedRule } from './types'

/* ─────────────────────────────────────────────────────────────────────────
   Element extractors — dimensions, colors, labels, breadcrumbs, CSS text.
───────────────────────────────────────────────────────────────────────── */

export function getDimensions(element: Element): Dimensions {
  const rect = element.getBoundingClientRect()
  const c = window.getComputedStyle(element)
  return {
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    viewportTop: Math.round(rect.top),
    viewportLeft: Math.round(rect.left),
    docTop: Math.round(rect.top + window.scrollY),
    docLeft: Math.round(rect.left + window.scrollX),
    marginTop: c.marginTop,
    marginRight: c.marginRight,
    marginBottom: c.marginBottom,
    marginLeft: c.marginLeft,
    paddingTop: c.paddingTop,
    paddingRight: c.paddingRight,
    paddingBottom: c.paddingBottom,
    paddingLeft: c.paddingLeft,
    borderTop: c.borderTopWidth,
    borderRight: c.borderRightWidth,
    borderBottom: c.borderBottomWidth,
    borderLeft: c.borderLeftWidth,
  }
}

export function rgbToHex(rgb: string | null): string | null {
  if (!rgb) return null
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!m) return null
  const hex =
    '#' +
    [m[1], m[2], m[3]]
      .map((n) => parseInt(n as string).toString(16).padStart(2, '0'))
      .join('')
  if (hex === '#000000' && rgb.includes('rgba') && rgb.match(/,\s*0\s*\)/))
    return null // fully transparent
  return hex
}

// Pull the first CSS color token out of a value for an inline swatch.
export function extractSwatchColor(value: string): string | null {
  if (!value) return null
  const hex = value.match(/#[0-9a-fA-F]{3,8}\b/)
  if (hex) return hex[0]
  const fn = value.match(/(?:rgba?|hsla?)\([^)]*\)/i)
  if (fn) return fn[0]
  return null
}

export function getElementLabel(el: Element): string {
  let label = el.tagName.toLowerCase()
  if (el.id) label += '#' + el.id
  else if (el.classList.length) {
    const cls = Array.from(el.classList)
      .filter((c) => !c.startsWith('scanner-'))
      .slice(0, 2)
      .join('.')
    if (cls) label += '.' + cls
  }
  const rect = el.getBoundingClientRect()
  return `${label}  ${Math.round(rect.width)}×${Math.round(rect.height)}`
}

/* Same info as getElementLabel, split so the selector name and the
   dimensions can be styled independently in the overlay label. */
export function getElementLabelParts(el: Element): { name: string; dims: string } {
  let name = el.tagName.toLowerCase()
  if (el.id) name += '#' + el.id
  else if (el.classList.length) {
    const cls = Array.from(el.classList)
      .filter((c) => !c.startsWith('scanner-'))
      .slice(0, 2)
      .join('.')
    if (cls) name += '.' + cls
  }
  const rect = el.getBoundingClientRect()
  const dims = `${Math.round(rect.width)} × ${Math.round(rect.height)}`
  return { name, dims }
}

/* ─── Ruler measurements ──────────────────────────────────────────────────
   Edge-to-edge spacing between two picked elements (anchor + target), used by
   the Ruler overlay. Works for any pair of elements/text/images on the page. */

export interface RulerGap {
  distance: number
  line: { x1: number; y1: number; x2: number; y2: number }
}

/* Spacing between the anchor rect `a` and the target rect `b`. Returns one
   segment when they're separated on a single axis (stacked or side-by-side) and
   two (an L) when they're diagonal — one per axis that has a gap. Each segment's
   perpendicular coordinate is anchored to the target's center so the line meets
   the target's edge and lines up with the anchor's projected guide. */
export function measurePair(a: DOMRect, b: DOMRect): RulerGap[] {
  const gaps: RulerGap[] = []
  const bx = b.left + b.width / 2
  const by = b.top + b.height / 2

  // vertical gap
  if (b.top >= a.bottom)
    gaps.push({ distance: Math.round(b.top - a.bottom), line: { x1: bx, y1: a.bottom, x2: bx, y2: b.top } })
  else if (b.bottom <= a.top)
    gaps.push({ distance: Math.round(a.top - b.bottom), line: { x1: bx, y1: b.bottom, x2: bx, y2: a.top } })

  // horizontal gap
  if (b.left >= a.right)
    gaps.push({ distance: Math.round(b.left - a.right), line: { x1: a.right, y1: by, x2: b.left, y2: by } })
  else if (b.right <= a.left)
    gaps.push({ distance: Math.round(a.left - b.right), line: { x1: b.right, y1: by, x2: a.left, y2: by } })

  return gaps
}

// Breadcrumb as segment labels (root → element), capped at 4 with a leading '…'.
export function getElementBreadcrumb(el: Element): string[] {
  const parts: string[] = []
  let cur: Element | null = el
  while (cur && cur.tagName && cur.tagName.toLowerCase() !== 'html') {
    let p = cur.tagName.toLowerCase()
    if (cur.id) p += '#' + cur.id
    else if (cur.classList.length) {
      const cls = Array.from(cur.classList)
        .filter((c) => !c.startsWith('scanner-'))
        .slice(0, 2)
        .join('.')
      if (cls) p += '.' + cls
    }
    parts.unshift(p)
    if (cur.tagName.toLowerCase() === 'body') break
    cur = cur.parentElement
    if (parts.length >= 4) {
      const t = cur && cur.tagName && cur.tagName.toLowerCase()
      if (t && t !== 'body' && t !== 'html') parts.unshift('…')
      break
    }
  }
  return parts
}

// Full, untruncated ancestor chain (html → element) for the header tooltip.
export function getFullHierarchy(el: Element): Element[] {
  const chain: Element[] = []
  let cur: Element | null = el
  while (cur && cur.tagName) {
    chain.unshift(cur)
    if (cur.tagName.toLowerCase() === 'html') break
    cur = cur.parentElement
  }
  return chain
}

function authorRulesFor(element: Element): MatchedRule[] {
  return getMatchedRules(element).filter(
    (r): r is MatchedRule => r.type === 'rule' && !r.isReset,
  )
}

// Serialize matched author rules to CSS text for the Copy CSS action.
export function buildCSSText(element: Element): string {
  const rules = authorRulesFor(element)
  return cascadeSort(rules)
    .map((r) => {
      const sel = r.fullSelector || r.selector
      if (r.mediaCondition) {
        const body = r.declarations
          .map((d) => `    ${d.property}: ${d.value};`)
          .join('\n')
        return `@media ${r.mediaCondition} {\n  ${sel} {\n${body}\n  }\n}`
      }
      const body = r.declarations
        .map((d) => `  ${d.property}: ${d.value};`)
        .join('\n')
      return `${sel} {\n${body}\n}`
    })
    .join('\n\n')
}

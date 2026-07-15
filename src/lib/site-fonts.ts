import { CHROME_SELECTOR } from './site-colors'

/* ─────────────────────────────────────────────────────────────────────────
   Site-wide font scan — walk the whole inspected page and aggregate every
   font family its text renders in, keyed by the *declared* primary family
   (the first token of computed font-family). Mirrors site-colors.ts:
   framework-agnostic, reads only getComputedStyle.

   Known limitation: grouping is by declared primary family, not the face the
   engine actually selected per glyph — a stack whose first family never
   loaded still buckets under that name. The `loaded` flag (document.fonts
   probe) surfaces the obvious cases so the UI can tag them "fallback".
───────────────────────────────────────────────────────────────────────── */

/** An aggregated font family across the whole page. */
export interface SiteFont {
  key: string // lowercased primary family — aggregation + override key
  family: string // display name, original casing, quotes stripped
  isGeneric: boolean // primary token is a CSS generic (sans-serif, system-ui, …)
  loaded: boolean // a face for this family is actually available
  pct: number // share of all text-bearing elements, 0–100
  elementCount: number // distinct text-bearing elements using this family
  elements: Element[]
}

const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'math',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
])

/* Does the element hold its own visible text (so its font is actually drawn,
   not just inherited by an empty wrapper)? Same idea as site-colors.ts, plus
   form controls, whose text lives in value/options rather than child nodes. */
const TEXT_CONTROL_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'])

function rendersText(el: Element): boolean {
  if (TEXT_CONTROL_TAGS.has(el.tagName)) return true
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim())
      return true
  }
  return false
}

/** First family of a computed font-family stack, quotes stripped. */
export function primaryFamily(stack: string): string {
  return (stack || '').split(',')[0]?.replace(/['"]/g, '').trim() ?? ''
}

interface Bucket {
  family: string
  elements: Set<Element>
}

/* Walk the page and return the fonts in use, most-used first. */
export function scanSiteFonts(): SiteFont[] {
  const root = document.body
  if (!root) return []

  const buckets = new Map<string, Bucket>()
  let totalElements = 0

  for (const el of root.querySelectorAll('*')) {
    if (el.closest(CHROME_SELECTOR)) continue
    let cs: CSSStyleDeclaration
    try {
      cs = getComputedStyle(el)
    } catch {
      continue
    }
    if (cs.display === 'none') continue
    if (!rendersText(el)) continue

    const family = primaryFamily(cs.fontFamily)
    if (!family) continue
    totalElements++

    const key = family.toLowerCase()
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { family, elements: new Set() }
      buckets.set(key, bucket)
    }
    bucket.elements.add(el)
  }

  if (!totalElements) return []

  return Array.from(buckets.entries())
    .map(([key, b]) => {
      const isGeneric = GENERIC_FAMILIES.has(key)
      // Generics always resolve to some face; quoting them in a check() probe
      // would make them read as (missing) literal family names.
      let loaded = isGeneric
      if (!isGeneric) {
        try {
          loaded = document.fonts.check(`12px "${b.family}"`)
        } catch {
          /* malformed family string — leave as not-loaded */
        }
      }
      return {
        key,
        family: b.family,
        isGeneric,
        loaded,
        pct: Math.round((b.elements.size / totalElements) * 100),
        elementCount: b.elements.size,
        elements: Array.from(b.elements),
      }
    })
    .sort((a, b) => b.elementCount - a.elementCount)
}

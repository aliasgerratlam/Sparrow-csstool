import { parseCssColor } from './color'
import type { ColorEntry } from './element-colors'

/* Detect Tailwind color utility classes on an element and resolve each to the
   color it actually paints. The color code is read from a throwaway probe
   element carrying just that one class, so it reflects the page's own Tailwind
   build (custom palette, arbitrary values, opacity modifiers) and is taken in
   isolation — so variant classes like `hover:bg-blue-600` report the color the
   class represents rather than the element's current resting color. */

const TW_COLOR_NAMES = new Set([
  'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber',
  'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue',
  'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
])
const TW_SHADES = new Set([
  '50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950',
])

// Utility prefix → the computed property whose color it sets. Properties
// starting with `--` are custom props (resolved via a hijacked `color`).
const PREFIX_PROP: Record<string, string> = {
  bg: 'background-color',
  text: 'color',
  decoration: 'text-decoration-color',
  outline: 'outline-color',
  accent: 'accent-color',
  caret: 'caret-color',
  fill: 'fill',
  stroke: 'stroke',
  ring: '--tw-ring-color',
  'ring-offset': '--tw-ring-offset-color',
  shadow: '--tw-shadow-color',
}

const BORDER_SIDE_PROP: Record<string, string> = {
  border: 'border-top-color',
  'border-t': 'border-top-color',
  'border-r': 'border-right-color',
  'border-b': 'border-bottom-color',
  'border-l': 'border-left-color',
  'border-x': 'border-left-color',
  'border-y': 'border-top-color',
  'border-s': 'border-inline-start-color',
  'border-e': 'border-inline-end-color',
}

/* Strip variant prefixes (`hover:`, `md:`, `dark:`, …) and a leading `!` to get
   the bare utility. Splits on top-level colons only, so bracketed variants like
   `supports-[display:flex]:` don't trip the split. */
function coreUtility(cls: string): string {
  let depth = 0
  let lastColon = -1
  for (let i = 0; i < cls.length; i++) {
    const c = cls[i]
    if (c === '[') depth++
    else if (c === ']') depth--
    else if (c === ':' && depth === 0) lastColon = i
  }
  let core = lastColon >= 0 ? cls.slice(lastColon + 1) : cls
  if (core.startsWith('!')) core = core.slice(1)
  return core
}

/* Is the part after a color-utility prefix actually a color? Accepts the named
   palette (`blue-500`), `white`/`black`, and arbitrary values (`[#1da1f2]`) —
   and so rejects same-prefix non-color utilities (`text-sm`, `border-2`). */
function isColorSpec(rest: string): boolean {
  if (rest === 'white' || rest === 'black') return true
  const named = rest.match(/^([a-z]+)-(\d{2,3})$/)
  if (named && TW_COLOR_NAMES.has(named[1]!) && TW_SHADES.has(named[2]!)) return true
  const arb = rest.match(/^\[(.+)\]$/)
  if (arb) return !!parseCssColor(arb[1]!.replace(/_/g, ' '))
  return false
}

/* The computed property a color utility class targets, or null if it isn't one. */
function classColorProp(core: string): { prop: string; custom: boolean } | null {
  const border = core.match(/^(border(?:-[trblxyse])?)-(.+)$/)
  if (border) {
    if (!isColorSpec(border[2]!)) return null
    return { prop: BORDER_SIDE_PROP[border[1]!] ?? 'border-top-color', custom: false }
  }
  const m = core.match(
    /^(ring-offset|ring|bg|text|decoration|outline|accent|caret|fill|stroke|shadow)-(.+)$/,
  )
  if (m && isColorSpec(m[2]!)) {
    const prop = PREFIX_PROP[m[1]!]!
    return { prop, custom: prop.startsWith('--') }
  }
  return null
}

interface Candidate {
  full: string
  core: string
  prop: string
  custom: boolean
}

/* Resolve every candidate's color in one DOM round-trip: build one probe div
   per class inside a single offscreen container, append once, read all computed
   colors, then remove. Custom-prop utilities (ring/shadow) are read by piping
   the prop through `color`, which forces var() substitution. */
function resolveColors(items: Candidate[]): (string | null)[] {
  if (!document.body) return items.map(() => null)
  const container = document.createElement('div')
  container.setAttribute('aria-hidden', 'true')
  container.style.cssText =
    'position:absolute;left:-99999px;top:0;width:0;height:0;overflow:hidden;pointer-events:none;'
  const probes = items.map((it) => {
    const p = document.createElement('div')
    p.className = it.core
    if (it.custom) p.style.color = `var(${it.prop})`
    container.appendChild(p)
    return p
  })
  document.body.appendChild(container)
  const out = items.map((it, i) => {
    const cs = getComputedStyle(probes[i]!)
    const val = it.custom ? cs.color : cs.getPropertyValue(it.prop)
    return val ? val.trim() : null
  })
  document.body.removeChild(container)
  return out
}

/* The element's Tailwind color classes as dropper rows — label is the class
   (variant included), value is its resolved color. Empty when the element has
   none, or when none resolve (e.g. the page isn't actually built with Tailwind),
   so the caller can fall back to the generic computed-color list. */
export function extractTailwindColors(el: Element): ColorEntry[] {
  const candidates: Candidate[] = []
  for (const full of Array.from(el.classList)) {
    const core = coreUtility(full)
    const cp = classColorProp(core)
    if (cp) candidates.push({ full, core, prop: cp.prop, custom: cp.custom })
  }
  if (!candidates.length) return []

  const resolved = resolveColors(candidates)
  const out: ColorEntry[] = []
  const seen = new Set<string>()
  candidates.forEach((c, i) => {
    const raw = resolved[i]
    if (!raw) return
    const rgba = parseCssColor(raw)
    if (!rgba || rgba[3] === 0) return // unresolvable or fully transparent
    const key = `${c.full}|${rgba.join(',')}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ label: c.full, raw })
  })
  return out
}

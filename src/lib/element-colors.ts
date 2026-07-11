import { COLOR_TOKEN, formatRgba, parseCssColor } from './color'
import { getMatchedRules } from './cssom'
import type { MatchedRule } from './types'

/* A single color an element actually paints. `raw` is what the swatch paints —
   normally one resolved CSS color token (`rgb(…)`/`oklch(…)`), but for a gradient
   header row it's the full `linear-gradient(…)` so the chip previews the gradient.
   `state` is the pseudo suffix (`:hover`, `::before`, …) when the color comes from
   a pseudo rule. `text` overrides the value column (e.g. the gradient's
   type/angle) and skips color-format conversion; `copyValue` is what the copy
   button copies when it differs from the shown value; `note` is a small badge
   (a gradient stop's position). */
export interface ColorEntry {
  label: string
  raw: string
  state?: string
  text?: string
  copyValue?: string
  note?: string
}

const SIDES = ['top', 'right', 'bottom', 'left'] as const
const SIDE_TAG: Record<(typeof SIDES)[number], string> = {
  top: 'T',
  right: 'R',
  bottom: 'B',
  left: 'L',
}

/* Friendly labels for the properties a pseudo rule can carry a color in, so a
   `:hover { background: … }` rule reads as "Background" like the resting rows. */
const PROP_LABEL: Record<string, string> = {
  background: 'Background',
  'background-color': 'Background',
  'background-image': 'Gradient',
  color: 'Text',
  border: 'Border',
  'border-color': 'Border',
  'border-top': 'Border T',
  'border-right': 'Border R',
  'border-bottom': 'Border B',
  'border-left': 'Border L',
  'border-top-color': 'Border T',
  'border-right-color': 'Border R',
  'border-bottom-color': 'Border B',
  'border-left-color': 'Border L',
  outline: 'Outline',
  'outline-color': 'Outline',
  'text-decoration': 'Decoration',
  'text-decoration-color': 'Decoration',
  'box-shadow': 'Shadow',
  'text-shadow': 'Text shadow',
  'caret-color': 'Caret',
  'accent-color': 'Accent',
  'column-rule': 'Column rule',
  'column-rule-color': 'Column rule',
  fill: 'Fill',
  stroke: 'Stroke',
}

function labelForProperty(prop: string): string {
  return (
    PROP_LABEL[prop] ??
    prop.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  )
}

/* Properties whose *entire* value is a single color — resolved directly so
   named colors (`red`) and vars-free values parse even though COLOR_TOKEN only
   matches hex/functional notations. Everything else (shorthands, gradients,
   shadows) is scanned for embedded color tokens instead. */
const SINGLE_COLOR_PROPS = new Set([
  'color',
  'background-color',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'text-decoration-color',
  'caret-color',
  'accent-color',
  'column-rule-color',
  'fill',
  'stroke',
  'stop-color',
  'flood-color',
  'lighting-color',
])

/* Pull every color token out of a multi-value property (box-shadow, gradient
   backgrounds) so each becomes its own row. */
function tokensIn(value: string): string[] {
  if (!value || value === 'none') return []
  return value.match(COLOR_TOKEN) ?? []
}

// ── Gradient parsing ────────────────────────────────────────────────────────

/** Split on top-level commas only (commas inside `rgb(…)` etc. are ignored).
    Also used by the site-wide asset scan to split layered background-image
    values into individual `url()`/gradient layers (site-assets.ts). */
export function splitTopLevel(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      out.push(s.slice(start, i))
      start = i + 1
    }
  }
  out.push(s.slice(start))
  return out.map((x) => x.trim())
}

// The leading color of a gradient stop: hex, a functional notation, or a name.
const LEADING_COLOR = /^(#[0-9a-fA-F]+|[a-z]+\([^)]*\)|[a-z]+)/i

function startsWithColor(part: string): boolean {
  const m = part.match(LEADING_COLOR)
  return !!m && !!parseCssColor(m[1] as string)
}

interface GradientStop {
  color: string
  pos: string | null
}

/** A stop token (`<color> [<position>]`) → its color and trailing position. */
function parseStop(tok: string): GradientStop | null {
  const t = tok.trim()
  const m = t.match(LEADING_COLOR)
  if (!m || !parseCssColor(m[1] as string)) return null
  const rest = t.slice(m[0].length).trim()
  return { color: m[1] as string, pos: rest || null }
}

/** Render gradient angles more readably: `135deg` → `135°`. */
function prettyDirection(dir: string): string {
  return dir.replace(/(-?[\d.]+)deg\b/gi, '$1°')
}

/* Parse the gradient layer(s) of a `background`/`background-image` value into a
   header row (type + angle/position, with the live gradient as its swatch) and
   one numbered row per color stop (`#1`, `#2`, …) carrying its position. */
function gradientEntries(value: string, state?: string): ColorEntry[] {
  if (!value || value === 'none') return []
  const layers = splitTopLevel(value).filter((l) => /gradient\(/i.test(l))
  const out: ColorEntry[] = []

  layers.forEach((layer, li) => {
    const m = layer.match(/^(repeating-)?(linear|radial|conic)-gradient\((.*)\)$/is)
    if (!m) return
    const repeating = !!m[1]
    const kind = (m[2] as string).toLowerCase()
    const parts = splitTopLevel(m[3] as string)

    // First part is the direction/shape clause unless it's already a color stop.
    let direction: string | null = null
    let startIdx = 0
    const first = parts[0] ?? ''
    if (kind === 'linear') {
      if (/^(-?[\d.]+(deg|grad|rad|turn)\b|to\s)/i.test(first)) {
        direction = first
        startIdx = 1
      }
    } else if (first && !startsWithColor(first)) {
      direction = first
      startIdx = 1
    }

    const stops = parts.slice(startIdx).map(parseStop).filter(Boolean) as GradientStop[]
    if (!stops.length) return

    const kindLabel =
      (repeating ? 'Repeating ' : '') + kind.charAt(0).toUpperCase() + kind.slice(1)
    // Only show a direction the CSS actually declares — an angle (`135deg`) or a
    // side keyword (`to top`, `to right`). When none is authored (e.g.
    // `linear-gradient(a, b)`) the browser omits it, so we show just the type.
    const dir = direction ? prettyDirection(direction) : ''

    const groupLabel = layers.length > 1 ? `Gradient ${li + 1}` : 'Gradient'
    out.push({
      label: groupLabel,
      raw: layer, // chip previews the full gradient
      text: dir ? `${kindLabel} · ${dir}` : kindLabel,
      copyValue: layer,
      state,
    })

    stops.forEach((s, i) => {
      const rgba = parseCssColor(s.color)
      out.push({
        label: `${groupLabel} #${i + 1}`,
        raw: rgba ? formatRgba(rgba[0], rgba[1], rgba[2], rgba[3]) : s.color,
        note: s.pos ?? undefined,
        state,
      })
    })
  })

  return out
}

/* Read the colors an element declares from its computed style — background,
   gradient stops, text, border (per side), outline, text-decoration, SVG
   fill/stroke, and box-shadow. Transparent / unresolvable / `none` values are
   skipped, and identical color+label pairs are deduped. Browser-agnostic: it
   only reads getComputedStyle, so Chrome and Firefox return the same list.
   Colors declared in pseudo-class / pseudo-element rules are appended (tagged
   with their state) from extractPseudoColors. */
export function extractElementColors(el: Element): ColorEntry[] {
  const cs = getComputedStyle(el)
  const out: ColorEntry[] = []
  const seen = new Set<string>()

  const add = (label: string, raw: string | null | undefined): void => {
    if (!raw || raw === 'none') return
    const rgba = parseCssColor(raw)
    if (!rgba || rgba[3] === 0) return // unresolvable or fully transparent
    const key = `${label}|${rgba.join(',')}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ label, raw })
  }

  add('Background', cs.backgroundColor)
  out.push(...gradientEntries(cs.backgroundImage))
  add('Text', cs.color)

  // Border — only sides that are actually drawn. Collapse to one row when every
  // visible side shares a color; otherwise label each side (Border T/R/B/L).
  const visibleSides = SIDES.filter((s) => {
    const width = parseFloat(cs.getPropertyValue(`border-${s}-width`)) || 0
    const style = cs.getPropertyValue(`border-${s}-style`)
    return width > 0 && style !== 'none' && style !== 'hidden'
  })
  const sideColors = visibleSides.map((s) => cs.getPropertyValue(`border-${s}-color`))
  if (visibleSides.length && sideColors.every((c) => c === sideColors[0])) {
    add('Border', sideColors[0])
  } else {
    visibleSides.forEach((s, i) => add(`Border ${SIDE_TAG[s]}`, sideColors[i]))
  }

  if (cs.outlineStyle !== 'none' && (parseFloat(cs.outlineWidth) || 0) > 0) {
    add('Outline', cs.outlineColor)
  }
  if (cs.textDecorationLine && cs.textDecorationLine !== 'none') {
    add('Decoration', cs.textDecorationColor)
  }

  if (el instanceof SVGElement) {
    add('Fill', cs.fill)
    add('Stroke', cs.stroke)
  }

  for (const tok of tokensIn(cs.boxShadow)) add('Shadow', tok)

  return [...out, ...extractPseudoColors(el)]
}

/* Colors declared in pseudo-class (`:hover`, `:focus`, …) and pseudo-element
   (`::before`, …) rules that match the element. getComputedStyle can't see these
   (they only apply when the element is in that state), so they're read from the
   matched author rules instead. Each entry carries its `state` for the badge. */
export function extractPseudoColors(el: Element): ColorEntry[] {
  let rules: MatchedRule[]
  try {
    rules = getMatchedRules(el).filter(
      (r): r is MatchedRule => r.type === 'rule' && !!r.state && !r.isReset,
    )
  } catch {
    return []
  }

  const out: ColorEntry[] = []
  const seen = new Set<string>()

  const add = (label: string, state: string, colorStr: string): void => {
    const rgba = parseCssColor(colorStr)
    if (!rgba || rgba[3] === 0) return
    const key = `${state}|${label}|${rgba.join(',')}`
    if (seen.has(key)) return
    seen.add(key)
    // Normalize to rgb/rgba so named colors and any notation render uniformly.
    out.push({ label, raw: formatRgba(rgba[0], rgba[1], rgba[2], rgba[3]), state })
  }

  for (const rule of rules) {
    const state = rule.state as string
    for (const decl of rule.declarations) {
      const prop = decl.property.toLowerCase()
      const label = labelForProperty(prop)
      if (prop === 'background' || prop === 'background-image') {
        const grad = gradientEntries(decl.value, state)
        if (grad.length) {
          out.push(...grad)
          continue
        }
        // No gradient (e.g. a plain `background: #fff`) → fall through to tokens.
      }
      if (SINGLE_COLOR_PROPS.has(prop)) {
        add(label, state, decl.value)
      } else {
        for (const tok of tokensIn(decl.value)) add(label, state, tok)
      }
    }
  }

  return out
}

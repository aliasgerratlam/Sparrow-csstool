/* Color math for the Color Dropper. These operate on raw numeric pixel RGBA
   read from a canvas — distinct from toHex()/rgbToHex() in format.ts/extractors.ts,
   which parse CSS color *strings*. */

const hex2 = (n: number): string =>
  Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')

/** `#rrggbb` from numeric channels. */
export function formatHex(r: number, g: number, b: number): string {
  return '#' + hex2(r) + hex2(g) + hex2(b)
}

/** `rgba(r, g, b, a)` — alpha rounded to 2 decimals. */
export function formatRgba(r: number, g: number, b: number, a: number): string {
  const alpha = Math.round((a / 255) * 100) / 100
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`
}

/** Convert RGB channels (0–255) to HSL (h in degrees, s/l in percent). */
export function rgbToHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      default:
        h = (r - g) / d + 4
        break
    }
    h /= 6
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  }
}

/** `hsl(h, s%, l%)`. */
export function formatHsl(h: number, s: number, l: number): string {
  return `hsl(${h}, ${s}%, ${l}%)`
}

// ── Color-format toggle (HEX ⇆ RGBA ⇆ HSL) for the inspector's CSS panel ─────

export type ColorFormat = 'hex' | 'rgba' | 'hsl'
export const COLOR_FORMATS: ColorFormat[] = ['hex', 'rgba', 'hsl']

/** The next format in the HEX → RGBA → HSL → HEX cycle. */
export function nextColorFormat(f: ColorFormat): ColorFormat {
  return COLOR_FORMATS[(COLOR_FORMATS.indexOf(f) + 1) % COLOR_FORMATS.length]!
}

/* Resolve ANY CSS color token to RGBA (0–255) via a 1×1 canvas, so named,
   hex, rgb/rgba, hsl, oklch, etc. all parse. Solid colors only ever touch this
   canvas, so it can never be tainted. */
let convCtx: CanvasRenderingContext2D | null | undefined
export function parseCssColor(str: string): [number, number, number, number] | null {
  if (convCtx === undefined) {
    convCtx = document
      .createElement('canvas')
      .getContext('2d', { willReadFrequently: true })
  }
  const ctx = convCtx
  if (!ctx) return null
  // Validity probe: an invalid color leaves fillStyle unchanged across baselines.
  ctx.fillStyle = '#000'
  ctx.fillStyle = str
  const probe = ctx.fillStyle
  ctx.fillStyle = '#fff'
  ctx.fillStyle = str
  if (ctx.fillStyle !== probe) return null
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return [r!, g!, b!, a!]
}

/* Matches color tokens *inside* a value — hex and functional notations. Gradient
   wrappers like linear-gradient(…) aren't in the alternation, so only their inner
   color stops are rewritten while the wrapper is left intact. The argument part
   tolerates ONE level of nested parens (var(), calc(), relative `rgb(from …)`)
   so such tokens match whole — a partial match could otherwise rewrite an inner
   fragment and corrupt the value; unresolvable tokens are left untouched. */
export const COLOR_TOKEN =
  /#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\((?:[^()]|\([^()]*\))*\)/gi

/** Rewrite every color token in a CSS value to the chosen format. Tokens that
    don't resolve to a real color (and non-color text) are left untouched. */
export function convertColorTokens(value: string, format: ColorFormat): string {
  if (!value) return value
  return value.replace(COLOR_TOKEN, (tok) => {
    const rgba = parseCssColor(tok)
    if (!rgba) return tok
    const [r, g, b, a] = rgba
    if (format === 'rgba') return formatRgba(r, g, b, a)
    if (format === 'hsl') {
      const { h, s, l } = rgbToHsl(r, g, b)
      if (a < 255) {
        const alpha = Math.round((a / 255) * 100) / 100
        return `hsla(${h}, ${s}%, ${l}%, ${alpha})`
      }
      return formatHsl(h, s, l)
    }
    // hex — 8-digit (#rrggbbaa) when translucent so alpha isn't silently dropped.
    return a < 255 ? formatHex(r, g, b) + hex2(a) : formatHex(r, g, b)
  })
}

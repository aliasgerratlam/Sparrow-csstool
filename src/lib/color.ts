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

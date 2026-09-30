import { rgbToHsl } from '@/lib/color'

/* Plain-language name for a scanned color ("Blue", "Pale blue", "Near black")
   so the Colors panel can label cards the way the design does. Pure heuristic
   on HSL — a readable label, not a color-science lookup. */

const HUES: Array<[number, string]> = [
  [15, 'Red'],
  [42, 'Orange'],
  [68, 'Yellow'],
  [95, 'Lime'],
  [160, 'Green'],
  [190, 'Teal'],
  [215, 'Sky'],
  [255, 'Blue'],
  [285, 'Purple'],
  [325, 'Pink'],
  [346, 'Rose'],
  [361, 'Red'],
]

export function colorName(rgba: readonly number[]): string {
  const { h, s, l } = rgbToHsl(rgba[0]!, rgba[1]!, rgba[2]!)

  // Near-neutrals: name by lightness alone.
  if (s < 8 || l > 97 || l < 4) {
    if (l >= 97) return 'White'
    if (l <= 4) return 'Black'
    if (l <= 14) return 'Near black'
    if (l >= 90) return 'Off white'
    if (l >= 72) return 'Light gray'
    if (l >= 38) return 'Gray'
    return 'Dark gray'
  }

  const base = HUES.find(([max]) => h < max)![1]
  if (l >= 90) return `Pale ${base.toLowerCase()}`
  if (l >= 74) return `Light ${base.toLowerCase()}`
  if (l <= 16) return base === 'Blue' ? 'Navy' : `Very dark ${base.toLowerCase()}`
  if (l <= 30) return `Dark ${base.toLowerCase()}`
  return base
}

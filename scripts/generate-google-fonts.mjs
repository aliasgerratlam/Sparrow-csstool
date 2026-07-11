/* Dev-time generator for src/data/google-fonts.json — the bundled Google Fonts
   catalog the Fonts tool ships (no API key at runtime). Fetches Google's public
   metadata endpoint and emits a compact tuple form:

     { "categories": ["sans-serif", ...],
       "families": [["Roboto", 0, [100,300,400,500,700,900], 1], ...] }

   Tuple = [family, categoryIndex, upright weights (ascending), italic 0|1].
   Re-run manually to refresh the catalog:  node scripts/generate-google-fonts.mjs */

import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const OUT = fileURLToPath(new URL('../src/data/google-fonts.json', import.meta.url))

// Google's metadata categories → the CSS-generic-ish names the picker filters on.
const CATEGORY_MAP = {
  'Sans Serif': 'sans-serif',
  Serif: 'serif',
  Display: 'display',
  Handwriting: 'handwriting',
  Monospace: 'monospace',
}
const CATEGORIES = ['sans-serif', 'serif', 'display', 'handwriting', 'monospace']

const res = await fetch('https://fonts.google.com/metadata/fonts')
if (!res.ok) throw new Error(`metadata fetch failed: ${res.status}`)
// The endpoint historically prefixes the JSON with an XSSI guard — strip it.
const text = (await res.text()).replace(/^\)\]\}'/, '')
const meta = JSON.parse(text)

const families = meta.familyMetadataList
  .map((f) => {
    const variants = Object.keys(f.fonts ?? {})
    const weights = variants
      .filter((v) => !v.endsWith('i'))
      .map(Number)
      .filter((w) => Number.isFinite(w))
      .sort((a, b) => a - b)
    const italic = variants.some((v) => v.endsWith('i')) ? 1 : 0
    const cat = CATEGORY_MAP[f.category] ?? 'display'
    if (!weights.length) return null // italic-only families can't fill wght tuples
    return [f.family, CATEGORIES.indexOf(cat), weights, italic]
  })
  .filter(Boolean)
  .sort((a, b) => a[0].localeCompare(b[0]))

const json = JSON.stringify({ categories: CATEGORIES, families })
await writeFile(OUT, json)
console.log(`wrote ${families.length} families (${(json.length / 1024).toFixed(1)} KB) → ${OUT}`)

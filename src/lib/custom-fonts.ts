/* ─────────────────────────────────────────────────────────────────────────
   Custom uploaded fonts for the Fonts tool.

   Users can upload their own font files (.ttf / .otf / .woff / .woff2) and
   use them as replacements exactly like a Google Fonts pick. Each file is
   read into an ArrayBuffer and registered via the FontFace API, so nothing
   leaves the browser. Fonts live for the session only (binary font data is
   too heavy for localStorage) in a tiny external store, subscribable via
   useSyncExternalStore so every open picker sees the same list.
───────────────────────────────────────────────────────────────────────── */

export interface CustomFont {
  source: 'custom'
  family: string
  fileName: string
  /** Used for the generic fallback tail; we can't sniff it, so sans-serif. */
  category: string
}

export const CUSTOM_FONT_EXTENSIONS = ['.ttf', '.otf', '.woff', '.woff2']

/** Type guard: is this replacement an uploaded font (vs a Google font)? */
export function isCustomFont(value: { family: string }): value is CustomFont {
  return (value as CustomFont).source === 'custom'
}

// Immutable snapshot (replaced on every change) so useSyncExternalStore's
// reference-equality change detection works — same pattern as the
// annotations store.
let fonts: CustomFont[] = []
const faces = new Map<string, FontFace>() // family → registered face
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((fn) => fn())
}

export function subscribeCustomFonts(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getCustomFonts(): CustomFont[] {
  return fonts
}

/* "Inter-Bold_v2.woff2" → "Inter Bold v2": strip the extension, turn
   separators into spaces. The result doubles as the CSS family name. */
function familyFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[-_+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/* Register one uploaded file. Rejects with a friendly message when the file
   isn't a font format the browser can parse. Re-uploading a file with the
   same derived family name replaces the previous face. */
export async function addCustomFont(file: File): Promise<CustomFont> {
  const ext = (file.name.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase()
  if (!CUSTOM_FONT_EXTENSIONS.includes(ext)) {
    throw new Error(
      `"${file.name}" isn't a supported font — use ${CUSTOM_FONT_EXTENSIONS.join(', ')}`,
    )
  }

  const family = familyFromFileName(file.name) || 'Custom Font'
  const buffer = await file.arrayBuffer()
  const face = new FontFace(family, buffer)
  try {
    await face.load()
  } catch {
    throw new Error(`Couldn't read "${file.name}" — the file doesn't look like a valid font`)
  }

  const prev = faces.get(family)
  if (prev) document.fonts.delete(prev)
  document.fonts.add(face)
  faces.set(family, face)

  const font: CustomFont = { source: 'custom', family, fileName: file.name, category: 'sans-serif' }
  fonts = [...fonts.filter((f) => f.family !== family), font]
  emit()
  return font
}

/* Unregister an uploaded font. Text currently refonted with it falls back to
   its stack's tail until the user picks something else or resets. */
export function removeCustomFont(family: string): void {
  const face = faces.get(family)
  if (face) document.fonts.delete(face)
  faces.delete(family)
  fonts = fonts.filter((f) => f.family !== family)
  emit()
}

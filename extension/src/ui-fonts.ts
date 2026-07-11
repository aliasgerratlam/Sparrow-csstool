/* ─────────────────────────────────────────────────────────────────────────
   Registers the tool's UI fonts (ABeeZee — the Sparrow chrome face — plus
   Plus Jakarta Sans + JetBrains Mono) at document level via the FontFace API,
   from woff2 files bundled with the extension (extension/fonts/, declared
   web-accessible in the manifest).

   The web app loads these through a Google Fonts @import in index.css, but
   that path is dead in the extension:
   - our stylesheet lives inside the shadow root, and Chromium ignores
     @font-face rules declared inside a shadow tree — the fonts would never
     register even when the import loads;
   - strict page CSPs block the fonts.googleapis.com fetch outright.

   FontFace + chrome.runtime.getURL sidesteps both: document.fonts is shared
   with shadow trees, the FontFace API isn't subject to style-src, and
   chrome-extension:// resources bypass the page's CSP.
───────────────────────────────────────────────────────────────────────── */

type UiFont = {
  family: string
  file: string
  /** Variable-font weight range, e.g. '200 800'. */
  weight: string
  style: 'normal' | 'italic'
}

const UI_FONTS: UiFont[] = [
  { family: 'ABeeZee', file: 'abeezee-latin.woff2', weight: '400', style: 'normal' },
  { family: 'ABeeZee', file: 'abeezee-latin-italic.woff2', weight: '400', style: 'italic' },
  { family: 'Plus Jakarta Sans', file: 'plus-jakarta-sans-latin.woff2', weight: '200 800', style: 'normal' },
  { family: 'Plus Jakarta Sans', file: 'plus-jakarta-sans-latin-italic.woff2', weight: '200 800', style: 'italic' },
  { family: 'JetBrains Mono', file: 'jetbrains-mono-latin.woff2', weight: '100 800', style: 'normal' },
  { family: 'JetBrains Mono', file: 'jetbrains-mono-latin-italic.woff2', weight: '100 800', style: 'italic' },
]

const installed: FontFace[] = []

export function installUiFonts() {
  for (const font of UI_FONTS) {
    try {
      const url = chrome.runtime.getURL(`fonts/${font.file}`)
      const face = new FontFace(font.family, `url("${url}") format("woff2")`, {
        weight: font.weight,
        style: font.style,
        display: 'swap',
      })
      document.fonts.add(face)
      installed.push(face)
      // Load eagerly — the files are small and this avoids a fallback flash
      // the first time each face is painted.
      face.load().catch(() => {})
    } catch {
      /* FontFace unavailable or a bad file — the UI falls back to system-ui. */
    }
  }
}

/** Removes the registered faces again (extension uninstalled — their
    chrome-extension:// URLs are dead anyway). */
export function uninstallUiFonts() {
  for (const face of installed) {
    try {
      document.fonts.delete(face)
    } catch {
      /* already gone */
    }
  }
  installed.length = 0
}

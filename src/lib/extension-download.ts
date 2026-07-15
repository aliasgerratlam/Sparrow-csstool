import { triggerBlobDownload, triggerUrlDownload } from './download'

/* Landing-page install CTAs download the built extension as a zip, picking the
   Chromium build or the Firefox build for the visitor's browser. The zips are
   produced by extension/scripts/package-ext.mjs into public/ (served at the
   site root) — their filenames must stay in sync with ZIP_NAMES there. */

const ZIPS = {
  firefox: { url: '/sparrow-firefox.zip', filename: 'sparrow-firefox.zip' },
  chromium: { url: '/sparrow-chrome.zip', filename: 'sparrow-chrome.zip' },
} as const

// Keep the button's "Downloading…" state visible for at least this long so the
// loader reads as intentional rather than flashing on a fast connection.
const MIN_SPINNER_MS = 600

/** Firefox is the only outlier among target browsers; everything else (Chrome,
 *  Edge, Brave, Opera, Vivaldi) uses the chromium build — matching the TARGETS
 *  split in package-ext.mjs. */
export function detectBrowserTarget(): 'firefox' | 'chromium' {
  return /firefox/i.test(navigator.userAgent) ? 'firefox' : 'chromium'
}

/** Fetch the zip into memory (this is the real work the loader reflects), then
 *  save it. On a fetch failure fall back to a plain anchor download so the CTA
 *  still works. Resolves once the download has been triggered. */
export async function downloadExtension(): Promise<void> {
  const target = ZIPS[detectBrowserTarget()]
  try {
    const [res] = await Promise.all([
      fetch(target.url),
      new Promise<void>((resolve) => setTimeout(resolve, MIN_SPINNER_MS)),
    ])
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    triggerBlobDownload(await res.blob(), target.filename)
  } catch {
    triggerUrlDownload(target.url, target.filename)
  }
}

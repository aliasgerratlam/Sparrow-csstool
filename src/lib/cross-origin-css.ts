/* ─────────────────────────────────────────────────────────────────────────
   Cross-origin stylesheet recovery.

   The browser refuses to expose `.cssRules` of a stylesheet served from a
   different origin than the page (a `SecurityError` is thrown on access), so
   `getMatchedRules` normally reports those sheets as "unreadable". But the
   raw CSS can often be re-fetched and parsed into a constructable
   `CSSStyleSheet` that IS readable — because we built it ourselves.

   This module is inert until a host wires up a fetcher via `setCssFetcher`:
   - The web app installs a plain CORS `fetch` (main.tsx) — recovers sheets
     whose server allows cross-origin reads (e.g. Google Fonts).
   - The extension routes through its background worker (host permissions),
     which can read any sheet regardless of CORS headers.
───────────────────────────────────────────────────────────────────────── */

type CssFetcher = (url: string) => Promise<string | null>

let cssFetcher: CssFetcher | null = null

/** Install the privileged CSS fetcher (the extension does this at boot). */
export function setCssFetcher(fetcher: CssFetcher | null): void {
  cssFetcher = fetcher
}

// Re-fetched, readable stand-ins keyed by the original stylesheet href.
const readable = new Map<string, CSSStyleSheet>()
// Hrefs we've already tried (loaded or failed) so we don't re-fetch forever.
const attempted = new Set<string>()
// Hrefs with a load currently in flight — dedup concurrent triggers.
const inFlight = new Set<string>()

const listeners = new Set<() => void>()

/** Subscribe to "a cross-origin sheet finished loading" so a view can refresh. */
export function subscribeCrossOrigin(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notify(): void {
  listeners.forEach((fn) => fn())
}

/** The re-fetched, readable copy of a cross-origin sheet, if we have one. */
export function getReadableSheet(href: string | null): CSSStyleSheet | null {
  if (!href) return null
  return readable.get(href) ?? null
}

// @import  url("a.css")  screen and (max-width: 40em) ;
const IMPORT_RE =
  /@import\s+(?:url\(\s*)?['"]?([^'")\s]+)['"]?\s*\)?\s*([^;]*);/gi

function resolveUrl(url: string, base: string): string {
  try {
    return new URL(url, base).href
  } catch {
    return url
  }
}

/* Constructable stylesheets silently drop `@import` rules, and some sites ship
   a cross-origin sheet that is *nothing but* imports (an import manifest). So
   before parsing, splice each `@import` in-place with the (recursively
   resolved) contents of the imported file, wrapping in `@media` when the import
   carries a media condition. Depth-capped and dedup'd against cycles. */
async function inlineImports(
  css: string,
  baseUrl: string,
  fetcher: CssFetcher,
  seen: Set<string>,
  depth: number,
): Promise<string> {
  if (depth <= 0) return css
  const matches = [...css.matchAll(IMPORT_RE)]
  if (!matches.length) return css

  const resolved = await Promise.all(
    matches.map(async (m) => {
      const url = resolveUrl(m[1] ?? '', baseUrl)
      if (seen.has(url)) return ''
      seen.add(url)
      let text = await fetcher(url).catch(() => null)
      if (!text) return ''
      text = await inlineImports(text, url, fetcher, seen, depth - 1)
      const media = m[2]?.trim()
      return media ? `@media ${media}{${text}}` : text
    }),
  )

  let i = 0
  return css.replace(IMPORT_RE, () => resolved[i++] ?? '')
}

async function loadSheet(href: string, fetcher: CssFetcher): Promise<void> {
  inFlight.add(href)
  try {
    let text = await fetcher(href)
    if (!text) return
    text = await inlineImports(text, href, fetcher, new Set([href]), 4)
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(text) // lenient: malformed rules are skipped, not thrown
    readable.set(href, sheet)
  } catch {
    /* fetch blocked or parse failed — leave it as an unreadable marker */
  } finally {
    inFlight.delete(href)
  }
}

/* Scan the document's stylesheets for cross-origin ones we haven't recovered
   yet, re-fetch and parse them, then notify subscribers. Idempotent and safe to
   call on every inspection — sheets already loaded/attempted/in-flight are
   skipped, and it's a no-op when no fetcher is installed. */
export function ensureCrossOriginLoaded(): void {
  const fetcher = cssFetcher
  if (!fetcher) return

  const pending: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    const href = sheet.href
    if (!href || attempted.has(href) || inFlight.has(href)) continue
    try {
      // Touching cssRules throws only for the cross-origin ones we care about.
      void sheet.cssRules
    } catch {
      attempted.add(href)
      pending.push(href)
    }
  }
  if (!pending.length) return

  Promise.all(pending.map((href) => loadSheet(href, fetcher))).then(() => {
    if (readable.size) notify()
  })
}

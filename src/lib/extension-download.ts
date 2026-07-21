/* Landing-page install CTAs send visitors to the extension's published store
   listing, picking the Chrome Web Store or Firefox Add-ons page for the
   visitor's browser. (Previously these downloaded a load-unpacked zip; Sparrow
   is now published on both stores, so we link out instead.) */

const STORE_URLS = {
  firefox: 'https://addons.mozilla.org/en-US/firefox/addon/sparrow-css-toolkit',
  chromium:
    'https://chromewebstore.google.com/detail/biogbnhkebjenaaajncehpkapdpdfdcd?utm_source=item-share-cb',
} as const

/** Firefox is the only outlier among target browsers; everything else (Chrome,
 *  Edge, Brave, Opera, Vivaldi) uses the Chrome Web Store listing. */
export function detectBrowserTarget(): 'firefox' | 'chromium' {
  return /firefox/i.test(navigator.userAgent) ? 'firefox' : 'chromium'
}

/** The store URL for a target (defaults to the visitor's detected browser). */
export function extensionStoreUrl(
  target: 'firefox' | 'chromium' = detectBrowserTarget(),
): string {
  return STORE_URLS[target]
}

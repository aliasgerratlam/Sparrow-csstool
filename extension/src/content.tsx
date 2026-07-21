import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { setCssFetcher } from '@/lib/cross-origin-css'
import { resetAll as resetAllRecolors } from '@/lib/site-recolor'
import { resetAllRefonts } from '@/lib/site-refont'
import { resetAllElementRefonts } from '@/lib/element-refont'
import { revertAll as revertAllPreviews } from '@/lib/preview'
import { getSessionIdFromUrl } from '@/lib/session'
import {
  isWebAppOrigin,
  onAuthPush,
  postExtReady,
} from '@/lib/extension-auth-channel'
import { ExtensionApp, type ExtApi } from './ExtensionApp'
import { MSG_AUTH_PUSH } from './auth-bridge'
import { installUiFonts, uninstallUiFonts } from './ui-fonts'

/* ─────────────────────────────────────────────────────────────────────────
   Content script — injected into every page. It does nothing until the user
   clicks the toolbar button (the background worker sends `sparrow-toggle`).
   The first toggle mounts the whole scanner inside a Shadow DOM so the tool's
   styles and the host page's styles stay fully isolated from each other;
   later toggles just show/hide it.
───────────────────────────────────────────────────────────────────────── */

const ROOT_ID = 'sparrow-scan-root'

// Let the inspector recover cross-origin stylesheets: the page can't read
// another origin's CSS (CORS), but the background worker can re-fetch it with
// host permissions and hand back the text.
setCssFetcher(
  (url) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { type: 'sparrow-fetch-css', url },
          (res) => {
            // Swallow "receiving end does not exist" etc. — treat as a miss.
            void chrome.runtime.lastError
            resolve(res?.text ?? null)
          },
        )
      } catch {
        resolve(null)
      }
    }),
)

// Shared handle the React tree fills in (ExtBridge) so we can drive the scanner.
const api: ExtApi = {
  toggle: () => {},
  enable: () => {},
  disable: () => {},
}

let mounted = false
let reactRoot: Root | null = null
let hostEl: HTMLElement | null = null
let cursorStyleEl: HTMLStyleElement | null = null

function mount() {
  // Guard against a stray second injection (e.g. SPA re-navigation).
  if (document.getElementById(ROOT_ID)) return

  const host = document.createElement('div')
  host.id = ROOT_ID
  hostEl = host
  // A zero-size, top-layer host: the floating chrome inside uses position:fixed
  // (positioned against the viewport), so the host itself never covers or
  // shifts the page. No transform/filter here — those would break fixed
  // positioning of the shadow content.
  // `font-size` inherits through the shadow boundary, so pin it: otherwise a
  // host page with a small root/body font-size shrinks any inherited (em /
  // unstyled) text in our UI. line-height is reset for the same reason.
  // `font-family` is pinned for the same reason — the app's base font lives on
  // the `body` rule, which matches nothing inside the shadow tree, so without
  // this the UI's labels/buttons inherit the *host page's* font (e.g. a serif)
  // instead of our sans-serif. Mirrors src/index.css's `body` font stack;
  // Plus Jakarta Sans itself is registered by installUiFonts() below.
  host.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:0;margin:0;padding:0;border:0;z-index:2147483647;font-size:16px;line-height:normal;font-family:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',sans-serif;"
  const shadow = host.attachShadow({ mode: 'open' })
  // Mount inside <body>, not <html>. Radix's modal overlays (Dialog/Popover) use
  // the `aria-hidden` lib, which defaults its scope to `document.body` and then
  // resolves our dialog content back to a body descendant via `unwrapHost` — i.e.
  // up to this shadow host. If the host sits under <html> (sibling of <body>),
  // `body.contains(host)` is false, so aria-hidden logs "…not contained inside…
  // Doing nothing" and skips. Homing the host in <body> resolves that and lets
  // modal a11y (hide the rest of the page while a dialog is open) work correctly.
  ;(document.body ?? document.documentElement).appendChild(host)

  // Keep keystrokes typed into our UI from leaking to the host page. Because the
  // scanner lives in an (open) Shadow DOM, keyboard events compose out and bubble
  // to the host document — and many sites bind document-level keydown handlers
  // (scroll libraries, single-key shortcuts) that hijack Space/arrows, call
  // preventDefault(), and scroll the page. That swallows the character before our
  // textarea can insert it: typing a space in a comment scrolls the page instead
  // of adding a space. Stopping propagation at the shadow root (still inside the
  // composed path, before the host document) keeps the default action intact — so
  // the character is still inserted — while the host never sees the event. Escape
  // is exempt so the scanner's document-level Esc-to-close handler still fires.
  const stopKeyLeak = (e: KeyboardEvent) => {
    if (e.key === 'Escape') return
    const t = e.target
    const editable =
      t instanceof HTMLElement &&
      (t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        t.isContentEditable)
    if (editable) e.stopPropagation()
  }
  shadow.addEventListener('keydown', stopKeyLeak)
  shadow.addEventListener('keyup', stopKeyLeak)
  shadow.addEventListener('keypress', stopKeyLeak)

  // Register the UI fonts (bundled woff2) on the document — @font-face inside
  // the shadow stylesheet wouldn't take effect, see ui-fonts.ts.
  installUiFonts()

  // Pull the compiled Tailwind/scanner CSS into the shadow root. `:root`-scoped
  // design tokens are re-homed onto `:host` so they resolve inside the shadow
  // tree (a bare `:root` would target the host page's document root).
  const styleEl = document.createElement('style')
  shadow.appendChild(styleEl)
  fetch(chrome.runtime.getURL('dist/content.css'))
    .then((r) => r.text())
    .then((css) => {
      // `rem` resolves against the *host page's* <html> font-size, ignoring the
      // shadow boundary — a site with a shrunk root (e.g. `font-size:62.5%`)
      // makes our whole UI tiny. Convert every rem to an absolute px (Tailwind's
      // base is 16px) so the tool's sizing is fixed regardless of the host.
      // Drop the Google Fonts @imports carried over from the web app's CSS:
      // they can't work here (@font-face is inert inside a shadow root) and
      // strict page CSPs log errors for the blocked fetch. The same fonts are
      // registered from bundled files by installUiFonts().
      const noImports = css.replace(
        /@import\s*(?:url\()?["']https:\/\/fonts\.googleapis\.com[^"']*["']\)?;/g,
        '',
      )
      const pinned = noImports.replace(
        /(-?[\d.]+)rem\b/g,
        (_, n) => `${parseFloat(n) * 16}px`,
      )
      // `:root` design tokens are re-homed onto `:host` so they resolve inside
      // the shadow tree (a bare `:root` would target the host page's document).
      styleEl.textContent = pinned.replace(/:root\b/g, ':host')
    })
    .catch(() => {
      /* CSS blocked (rare CSP) — the tool still functions, just unstyled. */
    })

  // Annotate mode sets `.annot-cursor` on the real <body>; its rule lives in the
  // shadow-scoped CSS and can't reach the light DOM, so mirror just that bit.
  const cursorStyle = document.createElement('style')
  cursorStyle.textContent = 'body.annot-cursor{cursor:crosshair !important;}'
  document.head?.appendChild(cursorStyle)
  cursorStyleEl = cursorStyle

  // Radix (dialogs/selects/tooltips) portals here — inside the shadow tree.
  const portalEl = document.createElement('div')
  portalEl.id = 'sparrow-portal'
  shadow.appendChild(portalEl)

  const mountEl = document.createElement('div')
  shadow.appendChild(mountEl)

  reactRoot = createRoot(mountEl)
  reactRoot.render(
    <StrictMode>
      <ExtensionApp portalContainer={portalEl} api={api} />
    </StrictMode>,
  )
  mounted = true
  startInvalidationWatch()
}

/* ─────────────────────────────────────────────────────────────────────────
   Teardown on extension removal. When the extension is uninstalled (or
   reloaded/updated), Chrome "orphans" this content script on already-open
   pages: the script keeps running but every chrome.* API dies, and nothing
   removes the DOM it injected — so the toolbar/inspector would linger until
   the tab is refreshed. While the tool is mounted we poll the extension
   context; the moment it's invalidated we unmount React (which detaches all
   document listeners and overlays via effect cleanups), revert every page
   edit the tool made, and remove every node we added.
───────────────────────────────────────────────────────────────────────── */

function contextAlive(): boolean {
  try {
    // On an orphaned script chrome.runtime is gone (or touching it throws
    // "Extension context invalidated").
    return typeof chrome !== 'undefined' && !!chrome.runtime?.id
  } catch {
    return false
  }
}

function teardown() {
  if (!mounted) return
  mounted = false

  // Revert live page edits first: recolor/refont overrides and previews write
  // !important inline styles onto the host page's own elements — unmounting
  // alone would strand them.
  try {
    revertAllPreviews()
    resetAllRecolors()
    resetAllRefonts()
    resetAllElementRefonts()
  } catch {
    /* best-effort — never let a revert failure block removing the UI */
  }

  try {
    reactRoot?.unmount()
  } catch {
    /* ignore — the host node is removed below regardless */
  }
  reactRoot = null

  hostEl?.remove()
  hostEl = null
  cursorStyleEl?.remove()
  cursorStyleEl = null
  document.body?.classList.remove('annot-cursor')
  uninstallUiFonts()
}

let watchTimer: number | null = null

function startInvalidationWatch() {
  if (watchTimer !== null) return
  watchTimer = window.setInterval(() => {
    if (contextAlive()) return
    if (watchTimer !== null) {
      clearInterval(watchTimer)
      watchTimer = null
    }
    teardown()
  }, 1000)
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'sparrow-toggle') return
  // First activation mounts the app (ExtBridge auto-enables it, so it comes up
  // visible). Every activation after that just flips it on/off.
  if (!mounted) mount()
  else api.toggle()
})

// Auth push bridge. On the Sparrow web app, the page runs real Clerk and posts
// its live auth state to the window; relay it to the background worker, which
// mirrors it into the storage snapshot every tab's ExtensionAuthProvider reads.
// This is how the extension learns who's signed in — cross-browser, and the
// replacement for Clerk Sync Host on Firefox (where the per-install
// moz-extension:// origin can't be added to Clerk's allowed_origins). Inert on
// every other origin.
if (isWebAppOrigin(location.origin)) {
  onAuthPush((msg) => {
    if (!contextAlive()) return
    try {
      chrome.runtime.sendMessage(
        { type: MSG_AUTH_PUSH, isSignedIn: msg.isSignedIn, user: msg.user },
        () => {
          void chrome.runtime.lastError
        },
      )
    } catch {
      /* context invalidated between the check and the send — ignore. */
    }
  })
  // Nudge the app to post its current state now, covering the case where the
  // app mounted (and posted) before this relay listener existed.
  postExtReady()
}

// Auto-open on a shared review link. When the page URL carries a live-session
// id (?sparrow-session=<id>), a collaborator has opened someone's share link —
// bring the scanner up immediately instead of waiting for a toolbar click, so
// they land straight on the sign-in modal (signed out) or the review chrome
// (signed in). run_at:document_idle guarantees the DOM is ready to mount into.
try {
  if (getSessionIdFromUrl() && !mounted) mount()
} catch {
  /* never let auto-open break the otherwise-inert content script */
}

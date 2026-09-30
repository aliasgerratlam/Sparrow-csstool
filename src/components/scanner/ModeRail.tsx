import { Fragment, type ReactNode } from 'react'
import { useScanner, type ScannerMode } from '@/context/scanner-context'
import { useAuth } from '@/context/auth-context'
import { useEntitlements, promptUpgrade } from '@/context/subscription-context'

/* Right-hand tool rail — a slim pill with the six tools grouped by job:
   measure (inspect, ruler) · feedback (annotate) · extract (colors, fonts,
   assets). Each tool carries a hover/focus tooltip (name + hint). Icons and copy
   come from the "Sparrow extension UI redesign" Main board. Styles live in
   src/styles/sparrow-ui/chrome.css. */

const SVG = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const ICONS: Record<ScannerMode, ReactNode> = {
  inspect: (
    <svg {...SVG}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <circle cx="11.5" cy="11.5" r="3.5" />
      <path d="M14 14l2.5 2.5" />
    </svg>
  ),
  ruler: (
    <svg {...SVG}>
      <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0z" />
      <path d="M14.5 12.5l2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2" />
    </svg>
  ),
  annotate: (
    <svg {...SVG}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  ),
  dropper: (
    <svg {...SVG}>
      <path d="M2 22l1-1h3l9-9" />
      <path d="M3 21v-3l9-9" />
      <path d="M15 6l3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3z" />
    </svg>
  ),
  fonts: (
    <svg {...SVG}>
      <path d="M4 7V4h16v3" />
      <path d="M9 20h6" />
      <path d="M12 4v16" />
    </svg>
  ),
  assets: (
    <svg {...SVG}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="9" cy="9" r="2" />
      <path d="M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </svg>
  ),
}

interface ToolDef {
  mode: ScannerMode
  /** DOM id — tests and scripts look these up. */
  id: string
  name: string
  desc: string
  /** Thin divider before this tool (group boundary). */
  sep?: boolean
}

const TOOLS: ToolDef[] = [
  { mode: 'inspect', id: 'rail-inspect', name: 'Inspect', desc: 'CSS behind any element' },
  { mode: 'ruler', id: 'rail-ruler', name: 'Ruler', desc: 'Distance between elements' },
  { mode: 'annotate', id: 'rail-annotate', name: 'Annotate', desc: 'Pin feedback', sep: true },
  { mode: 'dropper', id: 'rail-dropper', name: 'Colors', desc: 'Every color on the page', sep: true },
  { mode: 'fonts', id: 'rail-fonts', name: 'Fonts', desc: 'Audit and swap typefaces' },
  { mode: 'assets', id: 'rail-assets', name: 'Assets', desc: 'Images, SVGs, videos' },
]

/** Legacy hover copy, kept on `data-tooltip` for anything that still reads it. */
const LOCKED_TOOLTIP: Partial<Record<ScannerMode, string>> = {
  annotate: 'Sign in to use Annotate',
  dropper: 'Upgrade to use Color Change',
  fonts: 'Upgrade to use Fonts',
  assets: 'Upgrade to download assets',
}

export function ModeRail() {
  const { mode, frozen, setMode, unfreeze } = useScanner()
  const { isConfigured, isAuthenticated, loading } = useAuth()
  const { colorMode, fontMode, assets } = useEntitlements()

  // Annotate is sign-in-gated in the EXTENSION only. On the website it's part of
  // the free live demo, so visitors can annotate without signing in. (In the
  // extension the whole rail is hidden while signed out anyway — see below — so
  // this stays effectively unchanged there.) When auth isn't configured
  // (prototype) nothing is gated either.
  const annotateLocked =
    !!import.meta.env.VITE_IS_EXTENSION && isConfigured && !isAuthenticated

  // Paid modes — locked below the required tier. Entitlements are UNGATED in
  // prototype mode (no Kelviq), so these are all false there and nothing locks.
  const dropperLocked = !colorMode
  const fontsLocked = !fontMode
  const assetsLocked = !assets

  // In the extension the whole rail is sign-in-gated, not just Annotate: it
  // stays hidden until the user is signed in (and while auth is still loading,
  // so a signed-in user never sees it flash out). The web app keeps the rail
  // visible so the demo works signed-out.
  if (import.meta.env.VITE_IS_EXTENSION && (loading || !isAuthenticated))
    return null

  const locked: Partial<Record<ScannerMode, boolean>> = {
    annotate: annotateLocked,
    dropper: dropperLocked,
    fonts: fontsLocked,
    assets: assetsLocked,
  }

  const select = (m: ScannerMode) => {
    // Locked Annotate is a no-op — the tooltip tells the user to sign in first.
    if (m === 'annotate' && annotateLocked) return
    // Paid modes locked below the plan — nudge to upgrade instead of entering.
    if (m === 'dropper' && dropperLocked) return promptUpgrade('Color Change mode')
    if (m === 'fonts' && fontsLocked) return promptUpgrade('Font mode')
    if (m === 'assets' && assetsLocked) return promptUpgrade('Assets downloader')
    // Switching tools resets any frozen state — a ruler anchor and an inspect
    // selection share the same frozen/selectedEl, so carrying one into another
    // tool leaves you stuck on the previous element.
    if (m !== mode && frozen) unfreeze()
    setMode(m)
  }

  return (
    <nav
      id="mode-rail"
      className="sp-rail"
      role="toolbar"
      aria-orientation="vertical"
      aria-label="Sparrow tools"
    >
      {TOOLS.map((t) => {
        const isLocked = !!locked[t.mode]
        const active = mode === t.mode
        const tipId = `${t.id}-tip`
        const lockedHint = t.mode === 'annotate' ? 'Sign in to use' : 'Upgrade to unlock'
        return (
          <Fragment key={t.mode}>
            {t.sep && <span className="sp-rail-sep" aria-hidden="true" />}
            <div className="sp-rail-item">
              <button
                id={t.id}
                type="button"
                className={
                  'mode-rail-btn sp-rail-btn' +
                  (active ? ' active' : '') +
                  (isLocked ? ' locked' : '')
                }
                data-mode={t.mode}
                data-tooltip={isLocked ? LOCKED_TOOLTIP[t.mode] : t.name}
                aria-label={t.name}
                aria-pressed={active}
                aria-disabled={isLocked || undefined}
                aria-describedby={tipId}
                onClick={() => select(t.mode)}
              >
                {ICONS[t.mode]}
                {isLocked && (
                  <span className="sp-rail-lock" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="11" width="14" height="10" rx="2" />
                      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                    </svg>
                  </span>
                )}
              </button>
              <div id={tipId} role="tooltip" className="sp-rail-tip">
                <span className="sp-rail-tip-name">{t.name}</span>
                <span className="sp-rail-tip-desc">{isLocked ? lockedHint : t.desc}</span>
              </div>
            </div>
          </Fragment>
        )
      })}
    </nav>
  )
}

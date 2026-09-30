import { useState } from 'react'
import { AlignLeft } from 'lucide-react'
import { useScanner, type ScannerMode } from '@/context/scanner-context'
import { useAnnotationUI } from '@/context/annotation-ui-context'
import { useCollab } from '@/context/collab-context'
import { useAuth } from '@/context/auth-context'
import { useAnnotationCounts } from '@/hooks/use-annotations'
import { PresenceBar } from './PresenceBar'
import { ShareDialog } from '@/components/annotate/ShareDialog'
import { NotificationBell } from '@/components/annotate/NotificationBell'
import { UserMenu } from '@/components/auth/UserMenu'

/* Bottom session pill — Sparrow mark, the active tool's name + hint + Esc key,
   then share / account / close. Copy, icons and metrics come from the "Sparrow
   extension UI redesign" Main board; styles live in
   src/styles/sparrow-ui/chrome.css. */

const TOOL_LABEL: Record<ScannerMode, { name: string; hint: string }> = {
  inspect: { name: 'Inspect', hint: 'Hover to inspect · click to freeze' },
  ruler: { name: 'Ruler', hint: 'Click to anchor · hover to measure' },
  annotate: { name: 'Annotate', hint: 'Click an element to drop a pin' },
  dropper: { name: 'Colors', hint: 'Click a color to highlight it' },
  fonts: { name: 'Fonts', hint: 'Pick a family to preview a swap' },
  assets: { name: 'Assets', hint: 'Hover to preview · click to download' },
}

const ICON = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export function ScannerToolbar() {
  const { frozen, mode, disable, unfreeze, setHovered } = useScanner()
  const ui = useAnnotationUI()
  const { enabled, shareUrl, startSession } = useCollab()
  const { isConfigured, isAuthenticated, loading, openLoginDialog } = useAuth()
  const counts = useAnnotationCounts()
  const [shareOpen, setShareOpen] = useState(false)
  const [preparing, setPreparing] = useState(false)

  // Share = open the popover, making sure a link exists (start the session
  // silently if needed). No "live" wording.
  const onShare = async () => {
    // Open FIRST, then mint. Minting is a network round trip now (Clerk verify +
    // plan lookup + insert), so awaiting it first would leave the user staring at
    // a dead button; the dialog has a "Preparing your share link…" state for
    // exactly this, and shows the error/retry state if it fails.
    setShareOpen(true)
    if (enabled && !shareUrl) {
      setPreparing(true)
      try {
        await startSession()
      } finally {
        setPreparing(false)
      }
    }
  }

  // Close every open scanner surface (inspector panel, frozen selection,
  // annotation card, sidebar) so the login modal stands alone.
  const onSignIn = () => {
    unfreeze()
    setHovered(null)
    ui.closeCard()
    ui.closeSidebar()
    openLoginDialog()
  }

  // Review/Share are annotate features. In the EXTENSION they're signed-in only
  // (a sign-out mid-session can leave annotate active while unauthenticated —
  // route those clicks to login). On the website they're part of the free live
  // demo, so visitors use them without signing in.
  const requireAuth = (action: () => void) => () => {
    if (import.meta.env.VITE_IS_EXTENSION && isConfigured && !isAuthenticated)
      onSignIn()
    else action()
  }

  const label = TOOL_LABEL[mode]
  const hint = mode === 'inspect' && frozen ? 'Frozen · click again to resume' : label.hint

  return (
    <div
      id="scanner-toolbar"
      className="sp-bar"
      role="toolbar"
      aria-label="Sparrow session"
    >
      <span className="sp-bar-mark" role="img" aria-label="Sparrow">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 14c3 0 5-2 6-5 1 3 4 5 8 5-2 3-5 5-8 5-3 0-5-2-6-5z" />
          <path d="M14 7l3-3" />
        </svg>
      </span>

      <div id="scanner-hint" className="sp-bar-status">
        <span className="sp-bar-tool">{label.name}</span>
        <span className="sp-bar-hint" aria-live="polite">
          {hint}
        </span>
        <kbd className="sp-bar-kbd">Esc</kbd>
      </div>

      <PresenceBar />

      <span className="sp-bar-div" aria-hidden="true" />

      <div id="scanner-toolbar-right">
        {mode === 'annotate' && (
          <>
            <NotificationBell onRequireAuth={requireAuth} />
            <button
              id="scanner-review-btn"
              type="button"
              className="sp-bar-btn"
              title="Open review sidebar"
              aria-label={`Open review sidebar, ${counts.total} ${counts.total === 1 ? 'annotation' : 'annotations'}`}
              onClick={requireAuth(ui.toggleSidebar)}
            >
              <AlignLeft size={17} strokeWidth={1.8} aria-hidden="true" />
              {counts.total > 0 && (
                <span className="scanner-review-count" aria-hidden="true">
                  {counts.total}
                </span>
              )}
            </button>
            <button
              id="scanner-share-btn"
              type="button"
              className="sp-bar-btn"
              title="Share link"
              aria-label="Share annotations"
              aria-busy={preparing || undefined}
              disabled={preparing}
              onClick={requireAuth(() => void onShare())}
            >
              <svg width="17" height="17" {...ICON}>
                <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
                <path d="M16 6l-4-4-4 4M12 2v13" />
              </svg>
            </button>
          </>
        )}
        {/* While Clerk is still loading, render neither state — otherwise a
            signed-in user sees a "Sign in" flash on every page load. */}
        {isConfigured &&
          !loading &&
          (isAuthenticated ? (
            <UserMenu />
          ) : (
            <button type="button" className="sp-bar-signin" onClick={onSignIn}>
              Sign in
            </button>
          ))}
        <button
          id="scanner-disable-btn"
          type="button"
          className="sp-bar-btn sp-bar-close"
          title="Close Sparrow"
          aria-label="Close Sparrow"
          onClick={disable}
        >
          <svg width="17" height="17" {...ICON}>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        preparing={preparing}
      />
    </div>
  )
}

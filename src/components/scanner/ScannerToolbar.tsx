import { useState } from 'react'
import { AlignLeft, Share2, X } from 'lucide-react'
import { useScanner } from '@/context/scanner-context'
import { useAnnotationUI } from '@/context/annotation-ui-context'
import { useCollab } from '@/context/collab-context'
import { useAuth } from '@/context/auth-context'
import { useAnnotationCounts } from '@/hooks/use-annotations'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/Logo'
import { ArrowButton } from '@/components/landing/parts'
import { PresenceBar } from './PresenceBar'
import { ShareDialog } from '@/components/annotate/ShareDialog'
import { UserMenu } from '@/components/auth/UserMenu'

export function ScannerToolbar() {
  const { frozen, mode, disable, unfreeze, setHovered } = useScanner()
  const ui = useAnnotationUI()
  const { enabled, shareUrl, startSession } = useCollab()
  const { isConfigured, isAuthenticated, loading, openLoginDialog } = useAuth()
  const counts = useAnnotationCounts()
  const [shareOpen, setShareOpen] = useState(false)
  const [preparing, setPreparing] = useState(false)

  // Share = make sure a link exists (start the session silently if needed),
  // then open a popover showing the link. No "live" wording.
  const onShare = async () => {
    if (enabled && !shareUrl) {
      setPreparing(true)
      try {
        await startSession()
      } finally {
        // A failed session start must not wedge the button in "Sharing…";
        // the dialog opens either way and shows its error/retry state.
        setPreparing(false)
      }
    }
    setShareOpen(true)
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

  // Review/Share are annotate features — signed-in users only. Normally the
  // mode itself is gated (ModeRail), but a sign-out mid-session can leave
  // annotate mode active while unauthenticated; route those clicks to login.
  const requireAuth = (action: () => void) => () => {
    if (isConfigured && !isAuthenticated) onSignIn()
    else action()
  }

  return (
    <div id="scanner-toolbar">
      <Logo className="scanner-toolbar-logo" height={48} />
      {/* <span id="scanner-badge">
        <span className="scanner-badge-dot" />
        CSS Scanner Active
      </span> */}

      <div id="scanner-hint">
        {frozen ? (
          <span className="scanner-hint-frozen">
            📌 Frozen · Click again or Esc to resume
          </span>
        ) : (
          <>
            <kbd className="scanner-key">Hover</kbd>
            <span className="scanner-hint-label">inspect</span>
            <span className="scanner-hint-sep">·</span>
            <kbd className="scanner-key">Click</kbd>
            <span className="scanner-hint-label">freeze</span>
            <span className="scanner-hint-sep">·</span>
            <kbd className="scanner-key">Esc</kbd>
            <span className="scanner-hint-label">exit</span>
          </>
        )}
      </div>

      <div id="scanner-toolbar-right">
        <PresenceBar />
        {/* While Clerk is still loading, render neither state — otherwise a
            signed-in user sees a "Sign in" flash on every page load. */}
        {isConfigured &&
          !loading &&
          (isAuthenticated ? (
            <UserMenu />
          ) : (
            <ArrowButton
              variant="blue"
              onClick={onSignIn}
              className="px-4 py-2 text-sm [&_svg]:size-4"
            >
              Sign in
            </ArrowButton>
          ))}
        {mode === 'annotate' && (
          <>
            <Button
              id="scanner-review-btn"
              variant="ghost"
              title="Open review sidebar"
              onClick={requireAuth(ui.toggleSidebar)}
            >
              <AlignLeft size={15} strokeWidth={2.25} />
              Review
              <span className="scanner-review-count">{counts.total}</span>
            </Button>
            <Button
              id="scanner-share-btn"
              variant="ghost"
              title="Share link"
              disabled={preparing}
              onClick={requireAuth(() => void onShare())}
            >
              <Share2 size={14} strokeWidth={2.25} />
              {preparing ? 'Sharing…' : 'Share'}
            </Button>
          </>
        )}
        <Button
          id="scanner-disable-btn"
          variant="ghost"
          title="Disable scanner"
          aria-label="Disable scanner"
          onClick={disable}
        >
          <X size={16} strokeWidth={2.5} />
        </Button>
      </div>
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  )
}

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { useScanner } from '@/context/scanner-context'
import { useAuth } from '@/context/auth-context'
import { Logo } from '@/components/ui/Logo'

/* Extension-only sign-in gate. The whole tool is sign-in-gated in the
   extension (the mode rail is hidden too — see ModeRail), so the moment the
   scanner comes up signed-out this modal opens automatically and stays until
   the user authenticates. Sign in / Create account open the web app (Clerk
   can't run on host pages); when the user returns, the auth snapshot flips via
   chrome.storage and the modal unmounts on its own. Dismissing it closes the
   scanner instead — the tool isn't usable signed-out, so leaving it open
   behind the modal would just strand an inert toolbar.

   Visuals follow the "Sign in popup" board (Auth.dc.html): a 392px glass card
   with the blue Sparrow tile, an outline + a primary action, and — once the
   web sign-in tab has been opened — the board's "check your inbox" screen
   reworded as a "waiting" state (the extension can't collect an email itself).
   Styles: src/styles/sparrow-ui/account.css (.sp-auth-*). */

const ICON = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

type Step = 'sign-in' | 'waiting'

export function SignInGate() {
  const { isActive, disable } = useScanner()
  const { loading, isAuthenticated, openLoginDialog } = useAuth()
  const [step, setStep] = useState<Step>('sign-in')

  // While `loading` (first chrome.storage read) render nothing, so a
  // signed-in user never sees the modal flash on scanner startup.
  const open = isActive && !loading && !isAuthenticated

  // Start every presentation of the gate on the first screen.
  useEffect(() => {
    if (!open) setStep('sign-in')
  }, [open])

  const close = () => disable()

  const go = (mode: 'sign-in' | 'sign-up') => {
    openLoginDialog({ mode })
    setStep('waiting')
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent
        showCloseButton={false}
        // Radix would focus the first control (the close button) and paint a focus ring on
        // it the moment the gate opens; park focus on the dialog itself instead
        // so Tab still starts at the first control.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement | null)?.focus()
        }}
        className="sp-auth-shell border-0 bg-transparent p-0 shadow-none sm:max-w-[392px]"
        // Inline, not stylesheet: in the extension's shadow root the overlay's
        // stylesheet background can be dropped by the compositor (the page
        // behind stays undimmed); inline styles always paint. Mirrors the
        // [data-slot="dialog-overlay"] override in index.css.
        overlayStyle={{
          background: 'rgba(9,9,11,.42)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
        }}
      >
        <div className="sp-auth-card">
          <button
            type="button"
            className="sp-auth-x"
            aria-label="Close"
            onClick={close}
          >
            <svg width="16" height="16" {...ICON}>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          {step === 'sign-in' ? (
            <div className="sp-auth-screen">
              <span className="sp-auth-tile" aria-hidden="true">
                <Logo mark height={52} title="Sparrow" />
              </span>

              <DialogTitle asChild>
                <h2 className="sp-auth-title">Sign in to use Sparrow</h2>
              </DialogTitle>
              <DialogDescription asChild>
                <p className="sp-auth-sub">
                  Inspect CSS, swap colors &amp; fonts, and annotate any page —
                  sign in or create a free account to unlock the tools.
                </p>
              </DialogDescription>

              <button
                type="button"
                className="sp-auth-btn sp-auth-primary"
                onClick={() => go('sign-in')}
              >
                Sign in
                <svg width="16" height="16" {...ICON}>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>

              <button
                type="button"
                className="sp-auth-btn sp-auth-outline"
                onClick={() => go('sign-up')}
              >
                Create a free account
              </button>

              <p className="sp-auth-fine">
                You&rsquo;ll sign in on the Sparrow site — then come back to
                this tab and the tools unlock automatically. By continuing you
                agree to the{' '}
                <a href="https://www.trysparrowcss.com/terms" target="_blank" rel="noreferrer">
                  Terms
                </a>{' '}
                and{' '}
                <a href="https://www.trysparrowcss.com/privacy" target="_blank" rel="noreferrer">
                  Privacy Policy
                </a>
                .
              </p>
            </div>
          ) : (
            <div className="sp-auth-screen sp-auth-wait">
              <div className="sp-auth-envelope" aria-hidden="true">
                <span className="sp-auth-envelope-bg" />
                <span className="sp-auth-envelope-fg">
                  <svg width="26" height="26" {...ICON} stroke="#ffffff">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="M3 7l9 6 9-6" />
                  </svg>
                </span>
                <svg className="sp-auth-spark" width="18" height="18" viewBox="0 0 24 24">
                  <path d="M12 2l2 8 8 2-8 2-2 8-2-8-8-2 8-2z" fill="#f59e0b" />
                </svg>
              </div>

              <DialogTitle asChild>
                <h2 className="sp-auth-title">Finish signing in</h2>
              </DialogTitle>
              <DialogDescription asChild>
                <p className="sp-auth-sub sp-auth-sub-narrow">
                  We opened the Sparrow site in a new tab. Sign in there, then
                  come back to this page and the tools will unlock.
                </p>
              </DialogDescription>

              <div className="sp-auth-waiting" role="status">
                <span className="sp-auth-spinner" aria-hidden="true" />
                Waiting for you to sign in…
              </div>

              <button
                type="button"
                className="sp-auth-btn sp-auth-outline"
                onClick={() => openLoginDialog({ mode: 'sign-in' })}
              >
                Open the sign-in page again
              </button>
              <button
                type="button"
                className="sp-auth-link"
                onClick={() => setStep('sign-in')}
              >
                Back
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

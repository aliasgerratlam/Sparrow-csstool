import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { useScanner } from '@/context/scanner-context'
import { useAuth } from '@/context/auth-context'
import { Logo } from '@/components/ui/Logo'
import { ArrowButton } from '@/components/landing/parts'

/* Extension-only sign-in gate. The whole tool is sign-in-gated in the
   extension (the mode rail is hidden too — see ModeRail), so the moment the
   scanner comes up signed-out this modal opens automatically and stays until
   the user authenticates. Sign in / Create account open the web app (Clerk
   can't run on host pages); when the user returns, the auth snapshot flips via
   chrome.storage and the modal unmounts on its own. Dismissing it closes the
   scanner instead — the tool isn't usable signed-out, so leaving it open
   behind the modal would just strand an inert toolbar.

   Styled like the share dialog's glassy card (.ext-signin-* in index.css) with
   the landing page's 3D blue CTA, so it reads as native Sparoww chrome. */
export function SignInGate() {
  const { isActive, disable } = useScanner()
  const { loading, isAuthenticated, openLoginDialog } = useAuth()

  // While `loading` (first chrome.storage read) render nothing, so a
  // signed-in user never sees the modal flash on scanner startup.
  const open = isActive && !loading && !isAuthenticated

  const close = () => disable()

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="border-0 bg-transparent p-0 shadow-none sm:max-w-[400px]"
        // Inline, not stylesheet: in the extension's shadow root the overlay's
        // stylesheet background can be dropped by the compositor (the page
        // behind stays undimmed); inline styles always paint. Mirrors the
        // [data-slot="dialog-overlay"] override in index.css.
        overlayStyle={{
          background: 'rgba(15,20,40,.5)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
      >
        <div className="ext-signin-dialog">
          <button
            type="button"
            className="annot-share-x ext-signin-x"
            aria-label="Close"
            onClick={close}
          >
            ✕
          </button>

          <Logo height={44} className="ext-signin-logo" />

          <DialogTitle asChild>
            <h3>
              Sign in to use <span className="ext-signin-brand">Sparrow</span>
            </h3>
          </DialogTitle>
          <DialogDescription asChild>
            <p>
              Inspect CSS, swap colors &amp; fonts, and annotate any page —
              sign in or create a free account to unlock the tools.
            </p>
          </DialogDescription>

          <ArrowButton
            variant="blue"
            className="ext-signin-cta"
            onClick={() => openLoginDialog({ mode: 'sign-in' })}
          >
            Sign in
          </ArrowButton>

          <button
            type="button"
            className="ext-signin-signup"
            onClick={() => openLoginDialog({ mode: 'sign-up' })}
          >
            New here? <b>Create a free account</b>
          </button>

          <p className="ext-signin-hint">
            You&rsquo;ll sign in on the Sparrow site — then come back to this
            tab and the tools unlock automatically.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

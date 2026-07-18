import { useEffect, useRef } from 'react'
import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { ScannerProvider, useScanner } from '@/context/scanner-context'
import {
  AnnotationUIProvider,
  useAnnotationUI,
} from '@/context/annotation-ui-context'
import { CollabProvider } from '@/context/collab-context'
import { AuthProvider, useAuth, userDisplayName } from '@/context/auth-context'
import { SubscriptionProvider } from '@/context/kelviq-provider'
import { NavigationProvider } from '@/context/navigation-context'
import { InstallGuideProvider } from '@/context/install-guide-context'
import { AnnotationLimitSync } from '@/context/subscription-context'
import { InstallGuideDialog } from '@/components/landing/InstallGuideDialog'
import { LandingPage } from '@/components/landing/LandingPage'
import { AccountPage } from '@/components/account/AccountPage'
import { PrivacyPolicyPage } from '@/components/legal/PrivacyPolicyPage'
import { TermsPage } from '@/components/legal/TermsPage'
import { Scanner } from '@/components/scanner/Scanner'
import { Overlays } from '@/components/scanner/Overlays'
import { AnnotationLayer } from '@/components/annotate/AnnotationLayer'
import { Toaster } from '@/components/ui/sonner'
import { store } from '@/hooks/use-annotations'
import { canonicalPageUrl } from '@/lib/session'
import { AUTH_PROMPT_PARAM } from '@/lib/clerk'
import { bootStore } from '@/boot'

// Runs once, before first render, so the store is seeded synchronously.
const boot = bootStore()

// Routing (React Router). The Sparrow marketing site is the index ("/"); the
// account page lives at "/account"; any other path falls through to the landing
// page (which also hosts the scanner/annotation chrome and handles
// ?sparrow-session=<id> collab links via BootEffects). The providers below are
// hoisted ABOVE <Routes>, so Auth (Clerk) and subscriptions stay mounted across
// route changes — switching between "/" and "/account" is a client-side
// transition with no full-page reload. Note: static hosting must rewrite
// unknown paths to index.html (SPA fallback — see vercel.json) so "/account"
// resolves on a hard refresh.

function BootEffects({ sessionId }: { sessionId: string | null }) {
  const { openSidebar } = useAnnotationUI()
  const { enable, setMode } = useScanner()
  const { isAuthenticated, isConfigured, loading, openLoginDialog } = useAuth()
  // Run-once guards: enable()/setMode() reset scanner state (frozen, mode), so
  // they must not re-fire when auth flips mid-session; the sidebar likewise
  // shouldn't force itself back open after the user closes it.
  const enteredRef = useRef(false)
  const completedRef = useRef(false)
  useEffect(() => {
    // Wait for Clerk to settle — acting while `loading` would pop the sign-in
    // modal at already-signed-in users joining their own session link.
    if (!sessionId || loading) return
    if (!enteredRef.current) {
      enteredRef.current = true
      enable()
      // Enter annotate mode so the tool reads as active; while gated the
      // highlighter stays paused (ScannerController suppresses hover for
      // unauthenticated annotate).
      setMode('annotate')
    }
    // Annotate is gated behind auth: prompt login and complete entry when the
    // effect re-runs with isAuthenticated flipped. Dismissing the modal without
    // signing in leaves nothing to review, so send the visitor to the plain
    // Sparrow site (this page minus the ?sparrow-session param).
    if (isConfigured && !isAuthenticated) {
      openLoginDialog({
        onDismissed: () => window.location.replace(canonicalPageUrl()),
      })
      return
    }
    if (!completedRef.current) {
      completedRef.current = true
      openSidebar()
    }
  }, [
    sessionId,
    loading,
    isAuthenticated,
    isConfigured,
    openSidebar,
    enable,
    setMode,
    openLoginDialog,
  ])
  return null
}

// The browser extension's sign-in/sign-up buttons open this app with
// ?sparrow-auth=signin|signup (it can't run Clerk on host pages). Auto-open the
// matching Clerk modal on arrival so the user lands directly in the form, and
// strip the param so refreshes / copied links don't re-prompt.
function AuthPromptEffect() {
  const { isConfigured, isAuthenticated, loading, openLoginDialog } = useAuth()
  const promptedRef = useRef(false)
  useEffect(() => {
    if (loading || promptedRef.current) return
    const url = new URL(window.location.href)
    const mode = url.searchParams.get(AUTH_PROMPT_PARAM)
    if (mode !== 'signin' && mode !== 'signup') return
    promptedRef.current = true
    url.searchParams.delete(AUTH_PROMPT_PARAM)
    window.history.replaceState(null, '', url.toString())
    if (isConfigured && !isAuthenticated)
      openLoginDialog({ mode: mode === 'signup' ? 'sign-up' : 'sign-in' })
  }, [loading, isConfigured, isAuthenticated, openLoginDialog])
  return null
}

// The website is a free live demo — annotations are NOT sign-in gated here
// (unlike the extension, which keeps its own gated copy of this effect). Keep
// the store loaded regardless of auth so a signed-out visitor's demo pins
// persist; boot already loaded them, so this just re-syncs once auth settles.
function AnnotationAuthSync() {
  const { isConfigured, loading } = useAuth()
  useEffect(() => {
    if (!isConfigured || loading) return
    store.reloadFromStorage()
  }, [isConfigured, loading])
  return null
}

// Mirrors the signed-in account name into the annotation author field, which
// feeds collab identity (makeIdentity) and new annotations' `author`.
function AuthAuthorSync() {
  const { user } = useAuth()
  const { setAuthor } = useAnnotationUI()
  useEffect(() => {
    // Clear on sign-out so the next author/collab identity isn't stale.
    setAuthor(user ? userDisplayName(user) : '')
  }, [user, setAuthor])
  return null
}

// Bridges react-router's navigate into the router-agnostic NavigationProvider,
// so shared components (ArrowButton, UserMenu) that also run in the extension
// can navigate client-side here while falling back to a full navigation there.
// Also scrolls to a #hash on arrival (e.g. "/#pricing" from the account page),
// which the router doesn't do on its own.
function RouterBridge({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) return
    // Wait a frame for the target route/section to mount before scrolling.
    const id = hash.slice(1)
    const raf = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(raf)
  }, [pathname, hash])
  return <NavigationProvider navigate={navigate}>{children}</NavigationProvider>
}

// Account page ("/account") — Clerk profile + subscription management, rendered
// alone (no scanner/annotation chrome).
function AccountRoute() {
  return <AccountPage />
}

// Index ("/") and any unmatched path — the Sparrow landing page. It carries the
// scanner/annotation chrome so the hero "Try Demo" CTA can run the inspector on
// this page in place, and BootEffects auto-joins a ?sparrow-session=<id> link.
function IndexRoute() {
  return (
    <ScannerProvider>
      <AnnotationUIProvider>
        <CollabProvider>
          <BootEffects sessionId={boot.sessionId} />
          <AuthPromptEffect />
          <AnnotationAuthSync />
          <AuthAuthorSync />
          <AnnotationLimitSync />
          <LandingPage />
          <Scanner />
          <Overlays />
          <AnnotationLayer />
        </CollabProvider>
      </AnnotationUIProvider>
    </ScannerProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SubscriptionProvider>
          <RouterBridge>
            {/* Wraps both routes so every download CTA (hero / CTA / footer) and
                the footer "Setup guide" link share one modal instance. */}
            <InstallGuideProvider>
              <Routes>
                <Route path="/account" element={<AccountRoute />} />
                <Route path="/privacy" element={<PrivacyPolicyPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="*" element={<IndexRoute />} />
              </Routes>
              <InstallGuideDialog />
              <Toaster />
            </InstallGuideProvider>
          </RouterBridge>
        </SubscriptionProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

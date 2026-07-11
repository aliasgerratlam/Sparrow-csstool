import { useEffect, useRef } from 'react'
import { ScannerProvider, useScanner } from '@/context/scanner-context'
import {
  AnnotationUIProvider,
  useAnnotationUI,
} from '@/context/annotation-ui-context'
import { CollabProvider } from '@/context/collab-context'
import { AuthProvider, useAuth, userDisplayName } from '@/context/auth-context'
import { SubscriptionProvider } from '@/context/kelviq-provider'
import { AnnotationLimitSync } from '@/context/subscription-context'
import { LandingPage } from '@/components/landing/LandingPage'
import { AccountPage } from '@/components/account/AccountPage'
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

// Routing (no router lib — the app parses the URL directly). The Sparrow
// marketing site is the index ("/"); the account page lives at "/account".
// Any other path falls through to the landing page, which also hosts the
// scanner/annotation chrome and handles ?sparrow-session=<id> collab links
// (BootEffects). Note: static hosting must rewrite unknown paths to index.html
// (SPA fallback) so "/account" resolves on a hard refresh.
const path = window.location.pathname.replace(/\/+$/, '')
const isAccountPage = path === '/account'

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

// Annotations are gated behind sign-in when auth is configured: load them from
// storage once the user authenticates, and clear the in-memory list (keeping
// the localStorage copy) on sign-out — so a signed-out user never sees a stale
// review count. In prototype mode (auth not configured) boot already loaded.
function AnnotationAuthSync() {
  const { isConfigured, isAuthenticated, loading } = useAuth()
  useEffect(() => {
    if (!isConfigured || loading) return
    if (isAuthenticated) store.reloadFromStorage()
    else store.unload()
  }, [isConfigured, isAuthenticated, loading])
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

export default function App() {
  if (isAccountPage) {
    return (
      <AuthProvider>
        <SubscriptionProvider>
          <AccountPage />
          <Toaster />
        </SubscriptionProvider>
      </AuthProvider>
    )
  }

  // Index ("/") — the Sparrow landing page. It carries the scanner/annotation
  // chrome so the hero "Try Demo" CTA can run the inspector on this page in
  // place, and BootEffects auto-joins a ?sparrow-session=<id> collab link.
  return (
    <AuthProvider>
      <SubscriptionProvider>
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
              <Toaster />
            </CollabProvider>
          </AnnotationUIProvider>
        </ScannerProvider>
      </SubscriptionProvider>
    </AuthProvider>
  )
}

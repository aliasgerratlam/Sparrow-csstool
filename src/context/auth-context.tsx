import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react'
import { ClerkProvider, useClerk, useUser } from '@clerk/clerk-react'
import {
  CLERK_PUBLISHABLE_KEY,
  clerkAppearance,
  isAuthConfigured,
} from '@/lib/clerk'
import { PLAN_DISPLAY, toPlanId, type PlanId } from '@/lib/plans'

/* ─────────────────────────────────────────────────────────────────────────
   AuthContext — a thin adapter over Clerk. It owns nothing itself: sign-in /
   sign-up run through Clerk's hosted modal (openLoginDialog → clerk.openSignIn),
   and the signed-in user is normalised into a small, stable `AuthUser` shape so
   the rest of the app never touches Clerk types directly.

   When Clerk isn't configured (no VITE_CLERK_PUBLISHABLE_KEY) auth is
   unavailable: `isConfigured` is false and the app treats the user as a guest
   without gating anything, preserving the localStorage-only prototype.
───────────────────────────────────────────────────────────────────────── */

/** The Clerk user resource, derived from the hook so we don't guess exports. */
type ClerkUser = NonNullable<ReturnType<typeof useUser>['user']>

/** Normalised, provider-agnostic view of the signed-in user. */
export interface AuthUser {
  id: string
  /** Display name (may be empty — use userDisplayName() for a safe label). */
  name: string
  email: string
  emailVerified: boolean
  /** Sign-in method, e.g. 'google' for OAuth, else 'email'. */
  provider: string
  /** ISO date the account was created, when known. */
  createdAt: string | null
  /** ISO date of the last sign-in, when known. */
  lastSignInAt: string | null
  /** Clerk publicMetadata — seam for plan/billing (see userPlan). */
  metadata: Record<string, unknown>
}

interface AuthValue {
  /** Whether a Clerk auth backend is available at all. */
  isConfigured: boolean
  user: AuthUser | null
  isAuthenticated: boolean
  /** True until Clerk finishes loading the initial session. */
  loading: boolean
  signOut: () => Promise<void>
  /** The signed-in user's Clerk session JWT (null when signed out / guest).
      Used to authenticate calls to server functions, e.g. payment verification. */
  getToken: () => Promise<string | null>
  /** Re-fetch the signed-in user from Clerk so freshly-mirrored publicMetadata
      (e.g. the plan the kelviq-webhook just wrote) is picked up without a full
      page reload. No-op when signed out / guest. */
  reloadUser: () => Promise<void>
  /** Opens Clerk's hosted sign-in modal (any gated action can prompt login).
      `mode: 'sign-up'` opens the create-account form instead of sign-in.
      `onDismissed` fires if the user closes the modal while still signed out
      (it does NOT fire on a successful sign-in or an OAuth page redirect). */
  openLoginDialog: (opts?: {
    mode?: 'sign-in' | 'sign-up'
    onDismissed?: () => void
  }) => void
}

/* Exported so the browser-extension build can feed this exact context a value
   sourced from chrome.storage (see extension/src/ExtensionAuthProvider.tsx)
   instead of Clerk — useAuth() reads this context, so every existing gate works
   unchanged. The web app never touches it directly (use AuthProvider). */
export const AuthContext = createContext<AuthValue | null>(null)

/** Static context used when Clerk isn't configured (guest / prototype mode). */
const GUEST_VALUE: AuthValue = {
  isConfigured: false,
  user: null,
  isAuthenticated: false,
  loading: false,
  signOut: async () => {},
  getToken: async () => null,
  reloadUser: async () => {},
  openLoginDialog: () => {},
}

/** Map a Clerk user resource into our normalised `AuthUser`. */
function mapUser(user: ClerkUser): AuthUser {
  const email = user.primaryEmailAddress?.emailAddress ?? ''
  return {
    id: user.id,
    name: user.fullName || user.firstName || user.username || '',
    email,
    emailVerified:
      user.primaryEmailAddress?.verification?.status === 'verified',
    provider:
      user.externalAccounts.find(
        (a) => a.verification?.status === 'verified',
      )?.provider ??
      user.externalAccounts[0]?.provider ??
      'email',
    createdAt: user.createdAt ? user.createdAt.toISOString() : null,
    lastSignInAt: user.lastSignInAt ? user.lastSignInAt.toISOString() : null,
    metadata: user.publicMetadata ?? {},
  }
}

/* Clerk's hosted modal exposes no close/dismiss event, so detect a dismissal
   from the DOM: poll until the modal backdrop mounts, then fire once it
   unmounts while the user is still signed out. The grace delay covers the
   successful-sign-in case, where the modal closes a beat before the session
   lands on the Clerk client. Self-terminating — gives up if the modal never
   appears, and a sign-in (or OAuth full-page redirect) ends it silently. */
function watchSignInDismissed(
  isSignedOut: () => boolean,
  onDismissed: () => void,
): void {
  const POLL_MS = 250
  const APPEAR_TIMEOUT_MS = 15_000
  const SIGN_IN_GRACE_MS = 600
  let waited = 0
  let seen = false
  const timer = window.setInterval(() => {
    const open = !!document.querySelector('.cl-modalBackdrop')
    if (!seen) {
      seen = open
      waited += POLL_MS
      if (!open && waited >= APPEAR_TIMEOUT_MS) window.clearInterval(timer)
      return
    }
    if (open) return
    window.clearInterval(timer)
    window.setTimeout(() => {
      if (isSignedOut()) onDismissed()
    }, SIGN_IN_GRACE_MS)
  }, POLL_MS)
}

/** Bridges Clerk's hooks into our AuthContext (only mounted when configured). */
function AuthBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser()
  const clerk = useClerk()

  const signOut = useCallback(async () => {
    await clerk.signOut()
  }, [clerk])

  const getToken = useCallback(
    () => clerk.session?.getToken() ?? Promise.resolve(null),
    [clerk],
  )

  const reloadUser = useCallback(async () => {
    try {
      await user?.reload()
    } catch {
      /* transient Clerk fetch error — the next poll / page load recovers. */
    }
  }, [user])

  const openLoginDialog = useCallback(
    (opts?: { mode?: 'sign-in' | 'sign-up'; onDismissed?: () => void }) => {
      if (opts?.mode === 'sign-up') clerk.openSignUp()
      else clerk.openSignIn()
      const onDismissed = opts?.onDismissed
      if (onDismissed) watchSignInDismissed(() => !clerk.user, onDismissed)
    },
    [clerk],
  )

  const value = useMemo<AuthValue>(
    () => ({
      isConfigured: true,
      user: user ? mapUser(user) : null,
      isAuthenticated: !!isSignedIn,
      loading: !isLoaded,
      signOut,
      getToken,
      reloadUser,
      openLoginDialog,
    }),
    [user, isSignedIn, isLoaded, signOut, getToken, reloadUser, openLoginDialog],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // No Clerk key: skip ClerkProvider entirely and run as an unconfigured guest.
  if (!isAuthConfigured || !CLERK_PUBLISHABLE_KEY) {
    return <AuthContext value={GUEST_VALUE}>{children}</AuthContext>
  }
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      appearance={clerkAppearance}
      // Keep the OAuth round-trip (Google) on the current page.
      signInFallbackRedirectUrl={window.location.href}
      signUpFallbackRedirectUrl={window.location.href}
    >
      <AuthBridge>{children}</AuthBridge>
    </ClerkProvider>
  )
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

/** Display name for the signed-in user (name, else email, else a fallback). */
export function userDisplayName(user: AuthUser | null): string {
  if (!user) return ''
  return user.name || user.email || 'Account'
}

/* ─────────────────────────────────────────────────────────────────────────
   Subscription plan — mirrored from Kelviq into Clerk publicMetadata by the
   kelviq-webhook Edge Function. `plan`, `billing_cycle`, and `plan_renews_at`
   are the keys it writes; everyone defaults to Free. The canonical tiers +
   display copy live in lib/plans.ts (shared with the extension); this reader
   just resolves the signed-in user's current plan from their metadata.

   In the web app, live feature-gating reads Kelviq entitlements directly (see
   subscription-context). This metadata plan is what the browser extension
   gates on (it can't run the Kelviq React SDK on host pages) and what the
   account page shows.
───────────────────────────────────────────────────────────────────────── */

export type { PlanId }

export interface PlanInfo {
  id: PlanId
  name: string
  /** False only for the Free tier. */
  isPaid: boolean
  /** Display price for the active billing cycle (e.g. "$9"). */
  price: string
  billingCycle: 'monthly' | 'yearly' | null
  /** ISO date the plan next renews, when known. */
  renewsAt: string | null
}

/** Resolve the signed-in user's subscription plan from their metadata. */
export function userPlan(user: AuthUser | null): PlanInfo {
  const meta = user?.metadata ?? {}
  const id = toPlanId(meta.plan)
  const isPaid = id !== 'free'
  const cycleRaw = String(meta.billing_cycle ?? 'yearly').toLowerCase()
  const billingCycle: PlanInfo['billingCycle'] = isPaid
    ? cycleRaw === 'monthly'
      ? 'monthly'
      : 'yearly'
    : null
  const display = PLAN_DISPLAY[id]
  const price =
    billingCycle === 'monthly' ? display.monthlyPrice : display.yearlyPrice
  const renewsAt =
    isPaid && typeof meta.plan_renews_at === 'string'
      ? meta.plan_renews_at
      : null
  return { id, name: display.name, isPaid, price, billingCycle, renewsAt }
}

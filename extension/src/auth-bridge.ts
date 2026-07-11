/* The auth bridge between the background worker (which reads the web app's Clerk
   session via Sync Host) and the content script (which can't run Clerk on
   arbitrary host origins). The background is the authoritative writer of a small
   snapshot in chrome.storage.local; the content script's ExtensionAuthProvider
   reads it and subscribes to changes. Kept framework-free so both the worker and
   the content-script provider share one contract. */
import type { AuthUser } from '@/context/auth-context'

/** chrome.storage.local key holding the current auth snapshot. */
export const AUTH_STORAGE_KEY = 'sparrow-auth'

/** Minimal, serialisable view of auth state shared across extension contexts. */
export interface AuthSnapshot {
  isSignedIn: boolean
  /** The normalised AuthUser (same shape the web app uses), or null. */
  user: AuthUser | null
}

export const SIGNED_OUT: AuthSnapshot = { isSignedIn: false, user: null }

/* Messages the content script sends to the background worker. */
/** Payload may carry `mode: AuthPromptMode` ('signin' | 'signup') — the
    background appends it to the web-app URL so Clerk opens the right form. */
export const MSG_OPEN_SIGNIN = 'sparrow-open-signin'
export const MSG_SIGNOUT = 'sparrow-signout'
/** Ask the background to re-read the synced web-app session and update the snapshot. */
export const MSG_CHECK_AUTH = 'sparrow-check-auth'

/* Loosely-typed view of Clerk's UserResource — enough to build an AuthSnapshot
   in the background worker without importing the React auth-context (which would
   drag @clerk/clerk-react + React into the service worker). Mirrors mapUser() in
   src/context/auth-context.tsx. */
interface ClerkUserLike {
  id: string
  fullName?: string | null
  firstName?: string | null
  username?: string | null
  primaryEmailAddress?: {
    emailAddress?: string
    verification?: { status?: string } | null
  } | null
  externalAccounts?: Array<{
    provider?: string
    verification?: { status?: string } | null
  }>
  createdAt?: Date | null
  lastSignInAt?: Date | null
  publicMetadata?: Record<string, unknown>
}

/** Build the auth snapshot from a Clerk user (worker-safe; no React imports). */
export function snapshotFromClerkUser(user: ClerkUserLike | null): AuthSnapshot {
  if (!user) return SIGNED_OUT
  const ext = user.externalAccounts ?? []
  return {
    isSignedIn: true,
    user: {
      id: user.id,
      name: user.fullName || user.firstName || user.username || '',
      email: user.primaryEmailAddress?.emailAddress ?? '',
      emailVerified:
        user.primaryEmailAddress?.verification?.status === 'verified',
      provider:
        ext.find((a) => a.verification?.status === 'verified')?.provider ??
        ext[0]?.provider ??
        'email',
      createdAt: user.createdAt ? user.createdAt.toISOString() : null,
      lastSignInAt: user.lastSignInAt ? user.lastSignInAt.toISOString() : null,
      metadata: user.publicMetadata ?? {},
    },
  }
}

/** Read the current snapshot (defaults to signed-out when unset). */
export async function readAuthSnapshot(): Promise<AuthSnapshot> {
  try {
    const res = await chrome.storage.local.get(AUTH_STORAGE_KEY)
    const snap = res?.[AUTH_STORAGE_KEY] as AuthSnapshot | undefined
    return snap ?? SIGNED_OUT
  } catch {
    return SIGNED_OUT
  }
}

/** Persist the snapshot; content-script providers pick it up via onChanged. */
export async function writeAuthSnapshot(snap: AuthSnapshot): Promise<void> {
  try {
    await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: snap })
  } catch {
    /* storage unavailable — nothing we can do; gate stays closed. */
  }
}

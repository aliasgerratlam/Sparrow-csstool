import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { AuthContext, type AuthUser } from '@/context/auth-context'
import {
  AUTH_STORAGE_KEY,
  MSG_CHECK_AUTH,
  MSG_GET_TOKEN,
  MSG_OPEN_SIGNIN,
  MSG_SIGNOUT,
  readAuthSnapshot,
  SIGNED_OUT,
  type AuthSnapshot,
} from './auth-bridge'

/** Is the extension context still live? On an orphaned content script (the
    extension was reloaded/updated/uninstalled) `chrome.runtime` is gone or
    touching it throws "Extension context invalidated". */
function contextAlive(): boolean {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime?.id
  } catch {
    return false
  }
}

/** Decode a JWT's `exp` (seconds) WITHOUT verifying — purely to avoid handing
    over an already-expired token (the Edge Function verifies for real). Treats a
    missing / unparseable / past-exp token as expired, with a 30s skew so we never
    hand over one about to lapse mid-request. */
function isJwtExpired(token: string | null | undefined): boolean {
  if (!token) return true
  try {
    const payload = token.split('.')[1]
    if (!payload) return true
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const exp = (JSON.parse(json) as { exp?: unknown })?.exp
    if (typeof exp !== 'number') return true
    return Date.now() >= exp * 1000 - 30_000
  } catch {
    return true
  }
}

/** Chrome-only fallback: ask the background worker to mint a fresh Clerk session
    token via Sync Host. Resolves null on Firefox (no Sync Host session) or any
    failure — the caller then relies on the pushed token, or fails closed. */
function requestSyncHostToken(): Promise<string | null> {
  return new Promise((resolve) => {
    if (!contextAlive()) return resolve(null)
    try {
      chrome.runtime.sendMessage({ type: MSG_GET_TOKEN }, (res) => {
        void chrome.runtime.lastError
        const token = (res as { token?: unknown } | undefined)?.token
        resolve(typeof token === 'string' ? token : null)
      })
    } catch {
      resolve(null)
    }
  })
}

/** Ask the background to re-read the web app's synced Clerk session. Bound to
    `focus`/`visibilitychange`, so it can fire on an orphaned script after the
    extension reloads — every chrome.* touch there throws synchronously and
    would surface as an uncaught "Extension context invalidated". Guard hard. */
function requestAuthCheck() {
  if (!contextAlive()) return
  try {
    chrome.runtime.sendMessage({ type: MSG_CHECK_AUTH }, () => {
      void chrome.runtime.lastError
    })
  } catch {
    /* context invalidated between the check and the call — ignore. */
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Extension-only auth provider. Clerk can't run in the content script (it lives
   on arbitrary host-page origins, inside a Shadow DOM), so the user signs in on
   the web app and the background worker mirrors that session (via Clerk Sync
   Host) into a chrome.storage.local snapshot, which this provider reads. It feeds
   the SAME AuthContext the web app uses, so every existing gate (ModeRail /
   ScannerController / ScannerToolbar / the App-level sync effects) works
   unchanged — reading useAuth() as usual.

   Unlike the web app's AuthProvider, `isConfigured` is always true here: the
   extension ships with auth on, so gating is never bypassed regardless of the
   content bundle's (intentionally empty) VITE_CLERK_PUBLISHABLE_KEY. */
export function ExtensionAuthProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<AuthSnapshot | null>(null)

  useEffect(() => {
    let alive = true
    // Show the last-known snapshot immediately, then ask the background to
    // refresh it from the web app's synced session (in case the user signed in
    // on the web app while the extension wasn't watching).
    void readAuthSnapshot().then((s) => {
      if (alive) setSnapshot(s)
    })
    requestAuthCheck()

    // Flip the moment the background writes a new snapshot (sign-in / sign-out),
    // so the gate opens/closes without a reload.
    const onChanged = (
      changes: Record<string, { newValue?: unknown }>,
      area: string,
    ) => {
      if (area !== 'local' || !(AUTH_STORAGE_KEY in changes)) return
      const next = changes[AUTH_STORAGE_KEY]?.newValue as
        | AuthSnapshot
        | undefined
      setSnapshot(next ?? { isSignedIn: false, user: null })
    }
    try {
      chrome.storage.onChanged.addListener(onChanged)
    } catch {
      /* context already invalidated — nothing to subscribe to. */
    }

    // Returning to this tab after signing in on the web app re-checks auth, so
    // the gate unlocks without any manual refresh.
    const onVisible = () => {
      if (document.visibilityState === 'visible') requestAuthCheck()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', requestAuthCheck)

    return () => {
      alive = false
      try {
        chrome.storage.onChanged.removeListener(onChanged)
      } catch {
        /* context gone — the listener died with it. */
      }
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', requestAuthCheck)
    }
  }, [])

  const signOut = useCallback(
    () =>
      new Promise<void>((resolve) => {
        // Close the local gate immediately so the tool logs out at once — even
        // if the worker is asleep, the message is dropped, or the storage
        // onChanged event never lands. The background still ends the shared
        // Clerk session; this just guarantees the UI reflects the sign-out.
        setSnapshot(SIGNED_OUT)
        if (!contextAlive()) return resolve()
        try {
          chrome.runtime.sendMessage({ type: MSG_SIGNOUT }, () => {
            void chrome.runtime.lastError // swallow "no receiver" etc.
            resolve()
          })
        } catch {
          resolve()
        }
      }),
    [],
  )

  const openLoginDialog = useCallback(
    (opts?: { mode?: 'sign-in' | 'sign-up' }) => {
      // The background opens the web app with ?sparrow-auth=<mode>, which
      // auto-opens the matching Clerk form there (extension pages can't).
      if (!contextAlive()) return
      try {
        chrome.runtime.sendMessage(
          {
            type: MSG_OPEN_SIGNIN,
            mode: opts?.mode === 'sign-up' ? 'signup' : 'signin',
          },
          () => {
            void chrome.runtime.lastError
          },
        )
      } catch {
        /* context invalidated — the toolbar UI is about to be torn down. */
      }
    },
    [],
  )

  const value = useMemo(
    () => ({
      isConfigured: true,
      // `loading` until the first storage read resolves — ScannerToolbar hides
      // the sign-in/user chip while loading, so there's no signed-out flash.
      loading: snapshot === null,
      isAuthenticated: !!snapshot?.isSignedIn,
      user: (snapshot?.user ?? null) as AuthUser | null,
      signOut,
      // Token for Edge Function calls (the annotation-quota reserve). Clerk can't
      // run in the content script, so we can't mint one here. Prefer the
      // longer-lived JWT-template token the web app pushed into the snapshot — it
      // works on BOTH browsers, including Firefox where Sync Host can't mint. Fall
      // back to a fresh Sync Host token (Chrome only) when there's no pushed token
      // or it has expired. When neither is available the store fails CLOSED.
      getToken: async () => {
        const pushed = snapshot?.token
        if (pushed && !isJwtExpired(pushed)) return pushed
        return requestSyncHostToken()
      },
      // No Clerk instance here — ask the background to re-sync the snapshot,
      // which is the extension's equivalent of pulling fresh user metadata.
      reloadUser: async () => {
        requestAuthCheck()
      },
      openLoginDialog,
    }),
    [snapshot, signOut, openLoginDialog],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

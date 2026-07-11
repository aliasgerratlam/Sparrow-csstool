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
  MSG_OPEN_SIGNIN,
  MSG_SIGNOUT,
  readAuthSnapshot,
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
      // The extension does no payments; nothing consumes this token.
      getToken: async () => null,
      openLoginDialog,
    }),
    [snapshot, signOut, openLoginDialog],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

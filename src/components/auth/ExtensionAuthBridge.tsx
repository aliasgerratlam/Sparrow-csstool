import { useEffect } from 'react'
import { useAuth } from '@/context/auth-context'
import { onExtReady, postAuthToExtension } from '@/lib/extension-auth-channel'
import { EXTENSION_JWT_TEMPLATE } from '@/lib/clerk'

/* ─────────────────────────────────────────────────────────────────────────
   Website → extension auth push. The browser extension can't resolve the Clerk
   session on its own on Firefox (Clerk Sync Host rejects the per-install
   moz-extension:// origin), so the web app — which runs real Clerk here —
   actively broadcasts its auth state on the page window. The extension's
   content-script relay (running in this tab) forwards it to the background
   worker, which mirrors it into the snapshot every gate reads.

   It also mints and pushes a longer-lived Clerk JWT-template token
   (EXTENSION_JWT_TEMPLATE): the extension can't mint its own token on a host
   page (no Clerk; on Firefox no Sync Host), so this is its only token source
   there. Minted here on the web app's allow-listed origin, where Clerk runs
   freely. Re-minted on every push so the extension always carries a fresh one.

   Posts on mount and on every auth change, AND re-posts whenever a relay
   announces itself (ready ping), so it doesn't matter whether the app or the
   content script loaded first. Rendered on every route (see App.tsx), so a
   sign-in on "/" or "/account" propagates immediately. A no-op in normal
   browsing — the message only reaches a listener when the extension is present.
───────────────────────────────────────────────────────────────────────── */
export function ExtensionAuthBridge() {
  const { isConfigured, loading, isAuthenticated, user, getToken } = useAuth()

  useEffect(() => {
    // Wait for Clerk to settle so we don't push a transient signed-out state
    // that would briefly lock the extension for an already-signed-in user.
    if (!isConfigured || loading) return
    let cancelled = false

    const push = async () => {
      // Mint the longer-lived template token to hand the extension. Best-effort:
      // if signed out, or the JWT template isn't configured yet, getToken throws
      // or resolves null — push a null token and the extension falls back to
      // whatever it had (or fails closed on the quota). Never let this reject.
      let token: string | null = null
      if (isAuthenticated) {
        try {
          token = await getToken({ template: EXTENSION_JWT_TEMPLATE })
        } catch {
          token = null
        }
      }
      if (cancelled) return
      postAuthToExtension({ isSignedIn: isAuthenticated, user, token })
    }

    void push()
    // A relay may inject after we've already pushed (tab opened before the
    // extension, SPA nav, etc.) — re-post (and re-mint) when it pings.
    const off = onExtReady(() => void push())
    return () => {
      cancelled = true
      off()
    }
  }, [isConfigured, loading, isAuthenticated, user, getToken])

  return null
}

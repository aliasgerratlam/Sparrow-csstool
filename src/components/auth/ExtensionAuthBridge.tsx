import { useEffect } from 'react'
import { useAuth } from '@/context/auth-context'
import { onExtReady, postAuthToExtension } from '@/lib/extension-auth-channel'

/* ─────────────────────────────────────────────────────────────────────────
   Website → extension auth push. The browser extension can't resolve the Clerk
   session on its own on Firefox (Clerk Sync Host rejects the per-install
   moz-extension:// origin), so the web app — which runs real Clerk here —
   actively broadcasts its auth state on the page window. The extension's
   content-script relay (running in this tab) forwards it to the background
   worker, which mirrors it into the snapshot every gate reads.

   Posts on mount and on every auth change, AND re-posts whenever a relay
   announces itself (ready ping), so it doesn't matter whether the app or the
   content script loaded first. Rendered on every route (see App.tsx), so a
   sign-in on "/" or "/account" propagates immediately. A no-op in normal
   browsing — the message only reaches a listener when the extension is present.
───────────────────────────────────────────────────────────────────────── */
export function ExtensionAuthBridge() {
  const { isConfigured, loading, isAuthenticated, user } = useAuth()

  useEffect(() => {
    // Wait for Clerk to settle so we don't push a transient signed-out state
    // that would briefly lock the extension for an already-signed-in user.
    if (!isConfigured || loading) return
    const push = () => postAuthToExtension({ isSignedIn: isAuthenticated, user })
    push()
    // A relay may inject after we've already pushed (tab opened before the
    // extension, SPA nav, etc.) — re-post when it pings.
    return onExtReady(push)
  }, [isConfigured, loading, isAuthenticated, user])

  return null
}

/* Shared window.postMessage protocol for the website → browser-extension auth
   push bridge. The web app runs real Clerk in its own (allow-listed) origin and
   broadcasts its auth state on the page window; the extension's content script,
   running in the same tab, relays it to the background worker, which mirrors it
   into the chrome.storage.local snapshot every ExtensionAuthProvider reads.

   This is the cross-browser replacement for Clerk Sync Host, which can't work on
   public Firefox installs (each install gets a random moz-extension:// origin
   that can't be added to Clerk's allowed_origins). Because the session is
   resolved by the web app itself, no extension origin ever hits Clerk's FAPI.

   Kept framework-free so both the web app and the (React-free) content-script
   relay import it. The AuthUser import is type-only, so nothing from the auth
   context is pulled into the content bundle. */
import type { AuthUser } from '@/context/auth-context'

/** Web app → relay: the current auth state. */
export const EXT_AUTH_PUSH = 'sparrow-ext-auth-push'
/** Relay → web app: "I'm here, (re-)post your current auth state." Sent by the
    content script on load so the app posts even if the relay mounted after it. */
export const EXT_AUTH_QUERY = 'sparrow-ext-auth-query'

export interface ExtAuthPushMessage {
  source: typeof EXT_AUTH_PUSH
  isSignedIn: boolean
  /** The normalised AuthUser (same shape the extension snapshot stores), or null.
      No session token is ever sent — the mirrored plan in `user.metadata` is
      enough for gating; live-plan overlay stays a Chrome-Sync-Host nicety. */
  user: AuthUser | null
}

interface ExtAuthQueryMessage {
  source: typeof EXT_AUTH_QUERY
}

/** Origins the web app is served from — the only origins the relay trusts and
    the only ones the app answers a ready ping from. */
const WEB_APP_ORIGIN_RE = /^https:\/\/(www\.)?trysparrowcss\.com$/

function isLocalhostOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin)
    return hostname === 'localhost' || hostname === '127.0.0.1'
  } catch {
    return false
  }
}

/** True for the Sparrow web-app origins (prod + local dev). */
export function isWebAppOrigin(origin: string): boolean {
  return WEB_APP_ORIGIN_RE.test(origin) || isLocalhostOrigin(origin)
}

/** Web app: broadcast the current auth state to any listening relay. */
export function postAuthToExtension(payload: {
  isSignedIn: boolean
  user: AuthUser | null
}): void {
  try {
    const msg: ExtAuthPushMessage = {
      source: EXT_AUTH_PUSH,
      isSignedIn: payload.isSignedIn,
      user: payload.user,
    }
    window.postMessage(msg, window.location.origin)
  } catch {
    /* postMessage can throw on an opaque/null origin — nothing to do. */
  }
}

/** Relay: ask the web app to (re-)post its current auth state now. */
export function postExtReady(): void {
  try {
    const msg: ExtAuthQueryMessage = { source: EXT_AUTH_QUERY }
    window.postMessage(msg, window.location.origin)
  } catch {
    /* ignore — see postAuthToExtension. */
  }
}

/* We deliberately do NOT gate on `event.source === window`. In a Firefox content
   script (isolated world) that comparison frequently fails for page-posted
   messages due to Xray wrappers, which would silently drop every push and leave
   the extension permanently locked. Trust is established by the origin allowlist
   (only our own web-app origin) plus the specific message marker — sufficient for
   this first-party channel. */

/** Web app: run `cb` whenever a relay announces itself (so we re-post state). */
export function onExtReady(cb: () => void): () => void {
  const handler = (e: MessageEvent) => {
    if (!isWebAppOrigin(e.origin)) return
    if ((e.data as ExtAuthQueryMessage | undefined)?.source === EXT_AUTH_QUERY)
      cb()
  }
  window.addEventListener('message', handler)
  return () => window.removeEventListener('message', handler)
}

/** Relay: run `cb` with each auth push from the web app. */
export function onAuthPush(cb: (msg: ExtAuthPushMessage) => void): () => void {
  const handler = (e: MessageEvent) => {
    if (!isWebAppOrigin(e.origin)) return
    const data = e.data as ExtAuthPushMessage | undefined
    if (data?.source === EXT_AUTH_PUSH) cb(data)
  }
  window.addEventListener('message', handler)
  return () => window.removeEventListener('message', handler)
}

import { store } from '@/hooks/use-annotations'
import { getSessionIdFromUrl, isSessionHosted } from '@/lib/session'
import { isAuthConfigured } from '@/lib/clerk'

export interface BootResult {
  sessionId: string | null
}

/* Initialize the annotation store before first render. A share link carries a
   live-session id (?sparrow-session=<id>); opening one auto-joins that session. The
   session CREATOR (host, remembered via isSessionHosted) stays the author;
   everyone else joins as a `client` reviewer — they can reply and set status
   but not add/edit/delete annotations (CLIENT_WRITABLE in the store). The role
   must be set before any load() so the client localStorage bucket is used.

   When auth is configured, annotations are gated behind sign-in — so we do NOT
   load them here (that would surface a stale review count to a signed-out
   user). AnnotationAuthSync loads them once the user authenticates. In
   prototype mode (no auth) nothing is gated, so load immediately as before. */
export function bootStore(): BootResult {
  const sessionId = getSessionIdFromUrl()
  if (sessionId && !isSessionHosted(sessionId)) store.setRole('client')
  if (!isAuthConfigured) store.load()
  return { sessionId }
}

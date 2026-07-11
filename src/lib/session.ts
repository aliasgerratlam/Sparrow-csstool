/* ─────────────────────────────────────────────────────────────────────────
   Session identity + share-link helpers. A live collaboration session is a
   unique room whose id travels in the URL (?sparrow-session=<id>). The id keys
   the realtime channel (annot:<id>), so collaboration is only possible with the
   link. These are pure helpers — the Supabase side lives in session-api.ts.
───────────────────────────────────────────────────────────────────────── */

const SESSION_PARAM = 'sparrow-session'
/* Links minted before the rename used ?session=<id>; sessions live up to 3
   days, so keep reading (and stripping) the old name until those expire. */
const LEGACY_SESSION_PARAM = 'session'

/** Read the session id from the current URL's query string, if present. */
export function getSessionIdFromUrl(): string | null {
  try {
    const params = new URLSearchParams(location.search)
    const id = params.get(SESSION_PARAM) ?? params.get(LEGACY_SESSION_PARAM)
    return id && id.trim() ? id : null
  } catch {
    return null
  }
}

/** Generate a fresh session id (crypto UUID, with a timestamp fallback). */
export function newSessionId(): string {
  try {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID()
  } catch {
    /* ignore */
  }
  return 's' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36)
}

/** Build the shareable link for a session. Existing query params are KEPT (only
    the hash is dropped) so it stays symmetric with canonicalPageUrl — dropping
    them would give joiners a different page identity than the host's annotations
    (page_url mismatch → they'd see zero annotations and no live sync). */
export function buildShareUrl(id: string): string {
  try {
    const u = new URL(location.href)
    u.searchParams.delete(LEGACY_SESSION_PARAM)
    u.searchParams.set(SESSION_PARAM, id)
    u.hash = ''
    return u.toString()
  } catch {
    return location.origin + location.pathname + '?' + SESSION_PARAM + '=' + id
  }
}

/* The page identity used to scope annotations + the realtime room. It MUST be
   identical for the host and every joiner, so we strip the ?sparrow-session=
   param (the joiner's URL carries it, the host's doesn't) and the hash. Without
   this the two sides disagree and annotations never sync. */
export function canonicalPageUrl(): string {
  try {
    const u = new URL(location.href)
    u.searchParams.delete(SESSION_PARAM)
    u.searchParams.delete(LEGACY_SESSION_PARAM)
    u.hash = ''
    return u.origin + u.pathname + u.search
  } catch {
    return location.href.split('#')[0] as string
  }
}

/* Sessions started in this browser are remembered so the host stays the author
   on reload (the ?session= link otherwise looks like a joiner). */
const HOSTED_KEY = 'annot:hosted-sessions'

function readHosted(): string[] {
  try {
    const raw = localStorage.getItem(HOSTED_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

/** Record that this browser created `id` (so it boots back in as the host). */
export function markSessionHosted(id: string): void {
  try {
    const ids = readHosted()
    if (!ids.includes(id)) localStorage.setItem(HOSTED_KEY, JSON.stringify([...ids, id]))
  } catch {
    /* quota / privacy mode */
  }
}

/** True when this browser is the host (creator) of the given session. */
export function isSessionHosted(id: string): boolean {
  return readHosted().includes(id)
}

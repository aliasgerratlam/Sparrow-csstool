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

/* Volatile marketing/analytics params that ride along on a URL without changing
   which page it is. They must NOT leak into the page identity: two collaborators
   who reach the same page with different tracking params (e.g. one arrived via an
   ad, or GTM/ads rewrote the URL after load) would otherwise compute different
   page_url values and see completely disjoint annotation sets. Stripped in BOTH
   canonicalPageUrl and buildShareUrl so host and joiner always agree. */
const TRACKING_PARAMS = [
  'gclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'msclkid',
  'dclid',
  'yclid',
  '_gl',
  'mc_eid',
  'mc_cid',
  'ref',
  'ref_src',
]

/* Drop the session params, the hash, and any volatile tracking params (incl. the
   whole utm_* family) from a URL, leaving a stable page identity. Mutates `u`. */
function stripToPageIdentity(u: URL): void {
  u.searchParams.delete(SESSION_PARAM)
  u.searchParams.delete(LEGACY_SESSION_PARAM)
  for (const p of TRACKING_PARAMS) u.searchParams.delete(p)
  for (const key of [...u.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_')) u.searchParams.delete(key)
  }
  u.hash = ''
}

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

/** Build the shareable link for a session. Meaningful query params are KEPT (they
    identify the page); only the session params, hash, and volatile tracking params
    are stripped — exactly what canonicalPageUrl strips — so host and joiner derive
    the SAME page identity. Dropping meaningful params (or keeping tracking ones)
    would give a joiner a different page_url than the host's annotations
    (mismatch → they'd see zero annotations and no live sync). */
export function buildShareUrl(id: string): string {
  try {
    const u = new URL(location.href)
    stripToPageIdentity(u)
    u.searchParams.set(SESSION_PARAM, id)
    return u.toString()
  } catch {
    return location.origin + location.pathname + '?' + SESSION_PARAM + '=' + id
  }
}

/* The page identity used to scope annotations + the realtime room. It MUST be
   identical for the host and every joiner, so we strip the ?sparrow-session=
   param (the joiner's URL carries it, the host's doesn't), the hash, and any
   volatile tracking params (utm_*, gclid, _gl, …) that one side may carry and the
   other may not. Without this the two sides disagree and annotations never sync. */
export function canonicalPageUrl(): string {
  try {
    const u = new URL(location.href)
    stripToPageIdentity(u)
    return u.origin + u.pathname + u.search
  } catch {
    return location.href.split('#')[0] as string
  }
}

/** The origin (scheme + host + port) of a stored URL, or null if it can't be
    parsed. Used to bind a session to the site it was created on. */
export function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/* A session's stored page_url already begins with the origin it was created on
   (canonicalPageUrl returns origin + pathname + search). Comparing that origin
   with the current one lets us reject a share link reused on a different site —
   the id/channel are otherwise valid, so nothing else would stop it. */

/** True when a session's stored `page_url` was created on `currentOrigin`
    (defaults to the live origin). Fails CLOSED: a malformed/blank stored URL is
    treated as a mismatch rather than silently allowing the join. */
export function isSameSessionOrigin(
  sessionPageUrl: string,
  currentOrigin: string = location.origin,
): boolean {
  const o = originOf(sessionPageUrl)
  return o !== null && o === currentOrigin
}

/** Rebuild the working share link on a session's ORIGINAL page. `pageUrl` is a
    canonical page url (session + tracking params already stripped), so we just
    append the session param — mirrors buildShareUrl for a different page. */
export function shareUrlForPage(pageUrl: string, id: string): string {
  try {
    const u = new URL(pageUrl)
    u.searchParams.set(SESSION_PARAM, id)
    return u.toString()
  } catch {
    return pageUrl
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

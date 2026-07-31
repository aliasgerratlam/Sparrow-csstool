import {
  supabase,
  SESSIONS_TABLE,
  isCollabEnabled,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
} from '@/lib/supabase'
import { newSessionId } from '@/lib/session'
import { PLAN_LIMITS } from '@/lib/plans'

/* ─────────────────────────────────────────────────────────────────────────
   Supabase CRUD for live collaboration sessions. Thin, null-safe wrappers:
   when Supabase isn't configured they no-op so callers don't need to branch.
   A session is invalidated by flipping `active` to false while it's alive, and
   hard-deleted once it passes its `expires_at`. The host can then mint a fresh
   link. Annotations are page-scoped and persist independently — deleting a
   session never touches them.

   Share-link lifetime is PLAN-BASED (Free 24h / Pro 30d / Max never) and stamped
   ONCE at creation — nothing extends it afterwards, so the duration a host was
   promised is exact. Minting therefore has two paths (see mintSession):

     1. The `session-create` Edge Function, which resolves the lifetime from the
        caller's server-verified Clerk identity → live Kelviq plan. This is the
        only way to get more than the Free duration.
     2. A direct anon insert, used when (1) isn't available — signed out, gating
        off (prototype), no Clerk token (Firefox extension), or the function
        failed. Postgres caps this at the Free duration via the
        enforce_session_expiry trigger, so falling back degrades the DURATION but
        never the ability to share. That trigger — not the Edge Function — is the
        security boundary, which is why failing open here is safe.
───────────────────────────────────────────────────────────────────────── */

/** Free-tier lifetime, and the ceiling Postgres enforces on any anon insert. */
export const FREE_SHARE_EXPIRY_MS = PLAN_LIMITS.free.shareExpiryMs

const CREATE_FUNCTION = 'session-create'

export type GetToken = () => Promise<string | null>

export interface SessionRow {
  id: string
  page_url: string
  active: boolean
  created_by: string
  expires_at: string | null
}

/** Outcome of minting a link. `expiresAt` is the STORED expiry (null = never).
    `degraded` means we couldn't confirm the plan and fell back to Free's 24h, so
    the UI can say so instead of quoting the entitlement it expected. */
export interface MintResult {
  id: string
  expiresAt: string | null
  degraded: boolean
}

/** `ttlMs` is the app's in-memory representation (Infinity = never); the DB and
    the wire use null. Never JSON-serialize Infinity — it silently becomes null. */
function expiryFromTtl(ttlMs: number): string | null {
  if (!Number.isFinite(ttlMs)) return null
  return new Date(Date.now() + ttlMs).toISOString()
}

/* supabase-js surfaces a non-2xx Edge response as a FunctionsHttpError whose
   `.message` is generic; the actionable `{ error, reason }` is in the response
   body reachable via `error.context`. Same shape as annotation-quota-api.ts. */
async function edgeErrorMessage(error: unknown): Promise<string> {
  const ctx = (error as { context?: unknown })?.context
  if (ctx instanceof Response) {
    try {
      const body = await ctx.clone().json()
      const reason = typeof body?.reason === 'string' ? body.reason : ''
      const msg = typeof body?.error === 'string' ? body.error : ''
      const combined = [msg, reason].filter(Boolean).join(': ')
      if (combined) return combined
    } catch {
      /* body wasn't JSON — fall through. */
    }
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const m = (error as { message?: unknown }).message
    if (typeof m === 'string' && m) return m
  }
  return 'Session request failed'
}

/** Flatten a thrown value or a PostgrestError into ONE readable string.

    Every log site here passes the result as part of the message rather than as a
    second console argument: extension log viewers (chrome://extensions → Errors)
    stringify extra args, so `console.warn('… failed', error)` reads as the useless
    "[collab] … failed [object Object]" — with no way to tell a network drop from
    an RLS rejection. */
function describeDbError(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`
  if (e && typeof e === 'object') {
    const { message, code, details, hint } = e as Record<string, unknown>
    const parts = [code, message, details, hint].filter(
      (p): p is string => typeof p === 'string' && p !== '',
    )
    if (parts.length) return parts.join(' | ')
    try {
      return JSON.stringify(e)
    } catch {
      /* circular — fall through. */
    }
  }
  return String(e)
}

/** Ask for the Clerk token, retrying briefly. Right after sign-in the session can
    settle a beat after auth reports signed-in, so a single getToken() may resolve
    null for a signed-in user — and that would silently cost them their paid link
    duration. Returns null only when there's genuinely no token. */
async function resolveToken(getToken: GetToken): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = await getToken()
    if (token) return token
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
  }
  return null
}

/** Mint via the Edge Function, which stamps the plan's lifetime server-side.
    Throws on any failure so mintSession can fall back. */
async function createSessionViaBackend(
  id: string,
  pageUrl: string,
  createdBy: string,
  getToken: GetToken,
): Promise<{ id: string; expiresAt: string | null }> {
  if (!isCollabEnabled || !supabase) {
    throw new Error('Collaboration backend is not configured')
  }
  const token = await resolveToken(getToken)
  if (!token) throw new Error('No Clerk session token available')
  const { data, error } = await supabase.functions.invoke(CREATE_FUNCTION, {
    headers: { 'x-clerk-token': token },
    body: { id, pageUrl, createdBy },
  })
  if (error) throw new Error(await edgeErrorMessage(error))
  const row = (data ?? {}) as { id?: unknown; expiresAt?: unknown }
  if (typeof row.id !== 'string' || !row.id) {
    throw new Error('Session was not created')
  }
  return {
    id: row.id,
    expiresAt: typeof row.expiresAt === 'string' ? row.expiresAt : null,
  }
}

/** Create a new active session and return its id (or null if collab is off).
    Direct anon insert — the FALLBACK path; Postgres clamps `expires_at` to the
    Free duration for this caller regardless of what we send. Selects the row back
    so callers learn the stored expiry rather than trusting the value they sent. */
export async function createSession(
  pageUrl: string,
  createdBy: string,
  id: string = newSessionId(),
  ttlMs: number = FREE_SHARE_EXPIRY_MS,
): Promise<{ id: string; expiresAt: string | null } | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase
      .from(SESSIONS_TABLE)
      .insert({
        id,
        page_url: pageUrl,
        active: true,
        created_by: createdBy,
        expires_at: expiryFromTtl(ttlMs),
      })
      .select('id, expires_at')
      .single<Pick<SessionRow, 'id' | 'expires_at'>>()
    if (error) {
      console.warn(`[collab] createSession failed: ${describeDbError(error)}`)
      return null
    }
    return { id: data.id, expiresAt: data.expires_at ?? null }
  } catch (e) {
    console.warn(`[collab] createSession failed: ${describeDbError(e)}`)
    return null
  }
}

/** Mint a share link with the caller's plan lifetime.

    `active` mirrors AnnotationQuotaSync's flag (signed in AND gating on): only
    then can the Edge Function resolve a plan, so only then is it worth a round
    trip. Any failure degrades to the anon insert (Free duration) rather than
    refusing to share — see the module header for why that's safe. */
export async function mintSession({
  id,
  pageUrl,
  createdBy,
  getToken,
  active,
}: {
  id: string
  pageUrl: string
  createdBy: string
  getToken: GetToken
  active: boolean
}): Promise<MintResult | null> {
  if (!isCollabEnabled) return null

  if (active) {
    try {
      const row = await createSessionViaBackend(id, pageUrl, createdBy, getToken)
      return { id: row.id, expiresAt: row.expiresAt, degraded: false }
    } catch (e) {
      console.warn(
        '[collab] session-create unavailable — falling back to a 24h link: ' +
          describeDbError(e),
      )
    }
  }

  const row = await createSession(pageUrl, createdBy, id, FREE_SHARE_EXPIRY_MS)
  if (!row) return null
  // `degraded` only when we WANTED the backend and missed it; an unauthenticated
  // or ungated visitor is getting exactly the duration they're entitled to.
  return { id: row.id, expiresAt: row.expiresAt, degraded: active }
}

/** Fetch a session by id to validate a join. Null when missing or collab is off. */
export async function fetchSession(id: string): Promise<SessionRow | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase
      .from(SESSIONS_TABLE)
      .select('id, page_url, active, created_by, expires_at')
      .eq('id', id)
      .maybeSingle<SessionRow>()
    if (error) {
      console.warn(`[collab] fetchSession failed: ${describeDbError(error)}`)
      return null
    }
    return data ?? null
  } catch (e) {
    console.warn(`[collab] fetchSession failed: ${describeDbError(e)}`)
    return null
  }
}

/** Invalidate a session (mark inactive) when its room empties.

    Called from `beforeunload`, which is why this bypasses supabase-js and PATCHes
    PostgREST directly: the browser cancels in-flight fetches the moment the
    document goes away, so the ordinary request lost that race — leaving the room
    flagged live after the host left, and logging an opaque "Failed to fetch".
    `keepalive` lets the write outlive the page; `sendBeacon` can't, since it
    cannot carry the apikey/Authorization headers PostgREST requires.

    Best-effort by design (`active` is a hint, not a revocation — expiry is the
    real boundary), so a failure only warns. */
export function deactivateSession(id: string): void {
  if (!isCollabEnabled || !SUPABASE_URL || !SUPABASE_ANON_KEY) return
  const url = `${SUPABASE_URL}/rest/v1/${SESSIONS_TABLE}?id=eq.${encodeURIComponent(id)}`
  try {
    void fetch(url, {
      method: 'PATCH',
      keepalive: true,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'content-type': 'application/json',
        // No response body to read — the page is going away.
        prefer: 'return=minimal',
      },
      body: JSON.stringify({
        active: false,
        updated_at: new Date().toISOString(),
      }),
    })
      .then((res) => {
        if (!res.ok) {
          console.warn(
            `[collab] deactivateSession failed: HTTP ${res.status} ${res.statusText}`,
          )
        }
      })
      .catch((e: unknown) => {
        console.warn(`[collab] deactivateSession failed: ${describeDbError(e)}`)
      })
  } catch (e) {
    console.warn(`[collab] deactivateSession failed: ${describeDbError(e)}`)
  }
}

/** Re-activate a session — lets a returning host resume their own link.

    Deliberately does NOT touch `expires_at`. Lifetime is fixed at creation, so
    the duration the host's plan promised is exact: a Free link dies 24h after
    minting whether or not the room is busy. (It used to grant a fresh lease here,
    which meant an active link effectively never died — and would have let a Free
    joiner reviving a room shorten a Pro host's 30-day link.) The
    enforce_session_expiry trigger pins expires_at on UPDATE anyway, so an anon
    write here could never move it. */
export async function reactivateSession(id: string): Promise<void> {
  if (!supabase) return
  try {
    const { error } = await supabase
      .from(SESSIONS_TABLE)
      .update({ active: true, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error)
      console.warn(`[collab] reactivateSession failed: ${describeDbError(error)}`)
  } catch (e) {
    console.warn(`[collab] reactivateSession failed: ${describeDbError(e)}`)
  }
}

/** Hard-delete a session so its link is gone for good — used to retire an expired
    link and to revoke the old one when the host regenerates. Annotations are
    page-scoped and live in a separate table, so they are untouched. Safe to call
    redundantly; returns whether a row was actually removed.

    We `select()` the deleted rows rather than trusting the status code: under RLS a
    DELETE that matches nothing still succeeds (204/200 with zero rows), so if the
    `anon delete sessions` policy in schema.sql hasn't been applied to the project,
    every call here silently does nothing. That's worth a warning — regenerating a
    link would otherwise leave the old one live while the UI says it was retired.
    (Expiry itself is unaffected: the pg_cron sweep runs as the job owner and
    bypasses RLS.) */
export async function deleteSession(id: string): Promise<boolean> {
  if (!supabase) return false
  try {
    const { data, error } = await supabase
      .from(SESSIONS_TABLE)
      .delete()
      .eq('id', id)
      .select('id')
    if (error) {
      console.warn(`[collab] deleteSession failed: ${describeDbError(error)}`)
      return false
    }
    if (!data || data.length === 0) {
      console.warn(
        `[collab] deleteSession removed no rows for ${id} — already swept, or the` +
          ' "anon delete sessions" RLS policy is missing (re-run supabase/schema.sql).',
      )
      return false
    }
    return true
  } catch (e) {
    console.warn(`[collab] deleteSession failed: ${describeDbError(e)}`)
    return false
  }
}

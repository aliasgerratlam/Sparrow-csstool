import { supabase, SESSIONS_TABLE } from '@/lib/supabase'
import { newSessionId } from '@/lib/session'

/* ─────────────────────────────────────────────────────────────────────────
   Supabase CRUD for live collaboration sessions. Thin, null-safe wrappers:
   when Supabase isn't configured they no-op so callers don't need to branch.
   A session is invalidated by flipping `active` to false while it's alive, and
   hard-deleted once it passes its `expires_at` (3 days after creation). The
   host can then mint a fresh link. Annotations are page-scoped and persist
   independently — deleting a session never touches them.
───────────────────────────────────────────────────────────────────────── */

/** A live link expires this long after it's created (kept in sync with the
    sessions.expires_at default in supabase/schema.sql). */
export const SESSION_TTL_MS = 3 * 24 * 60 * 60 * 1000

export interface SessionRow {
  id: string
  page_url: string
  active: boolean
  created_by: string
  expires_at: string | null
}

/** True when a session has passed its 3-day lifetime (its link is dead). */
export function isSessionExpired(session: SessionRow): boolean {
  if (!session.expires_at) return false
  const at = Date.parse(session.expires_at)
  return Number.isFinite(at) && at <= Date.now()
}

/** Create a new active session and return its id (or null if collab is off). */
export async function createSession(
  pageUrl: string,
  createdBy: string,
): Promise<string | null> {
  if (!supabase) return null
  const id = newSessionId()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  try {
    const { error } = await supabase
      .from(SESSIONS_TABLE)
      .insert({
        id,
        page_url: pageUrl,
        active: true,
        created_by: createdBy,
        expires_at: expiresAt,
      })
    if (error) {
      console.warn('[collab] createSession failed', error)
      return null
    }
  } catch (e) {
    console.warn('[collab] createSession failed', e)
    return null
  }
  return id
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
      console.warn('[collab] fetchSession failed', error)
      return null
    }
    return data ?? null
  } catch (e) {
    console.warn('[collab] fetchSession failed', e)
    return null
  }
}

/** Invalidate a session (mark inactive) when its room empties. */
export async function deactivateSession(id: string): Promise<void> {
  if (!supabase) return
  try {
    const { error } = await supabase
      .from(SESSIONS_TABLE)
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) console.warn('[collab] deactivateSession failed', error)
  } catch (e) {
    console.warn('[collab] deactivateSession failed', e)
  }
}

/** Re-activate a session — lets a returning host resume their own link.
    Revival also grants a fresh lease: an actively used room shouldn't hard-die
    exactly 3 days after creation while people are still in it. */
export async function reactivateSession(id: string): Promise<void> {
  if (!supabase) return
  try {
    const { error } = await supabase
      .from(SESSIONS_TABLE)
      .update({
        active: true,
        expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) console.warn('[collab] reactivateSession failed', error)
  } catch (e) {
    console.warn('[collab] reactivateSession failed', e)
  }
}

/** Hard-delete an expired session so its link is gone for good. Annotations are
    page-scoped and live in a separate table, so they are untouched. Safe to
    call redundantly — a no-op if the row was already swept (e.g. by pg_cron). */
export async function deleteSession(id: string): Promise<void> {
  if (!supabase) return
  try {
    const { error } = await supabase.from(SESSIONS_TABLE).delete().eq('id', id)
    if (error) console.warn('[collab] deleteSession failed', error)
  } catch (e) {
    console.warn('[collab] deleteSession failed', e)
  }
}

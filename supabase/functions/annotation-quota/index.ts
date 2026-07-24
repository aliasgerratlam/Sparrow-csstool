/* ─────────────────────────────────────────────────────────────────────────
   annotation-quota — server-authoritative per-domain / 24h annotation cap.

   Why this exists: the cap NUMBER comes from the Kelviq entitlement, but the
   usage COUNT used to be 100% client-side (a localStorage ledger keyed by
   hostname). Clearing localStorage — or a fresh/incognito profile — reset the
   count to 0, so the cap could be bypassed. This function moves the count to
   the backend, keyed to the caller's Clerk identity (verified server-side), so
   it survives a storage wipe and can't be reset from devtools.

   Model: append-only ledger (`annotation_events`, one row per creation). The
   window is a trailing 24h; deleting an annotation does NOT refund a slot — the
   quota is a rate limit, matching the client fallback + the UI copy.

     action:'status'  → { used, limit, resetsInMs }
     action:'reserve' → count-then-insert; { allowed, used, limit, resetsInMs }

   `limit` is a number, or null for unlimited (Max). The single-user race window
   in count-then-insert is negligible; harden into an atomic security-definer SQL
   function later if needed.

   Auth: the caller's Clerk session token (x-clerk-token), verified server-side.
   Trusted-backend pattern, identical to the kelviq-* functions:
   verify_jwt = false (so the gateway doesn't 401 the CORS preflight) +
   authenticateUser(req) + service-role DB access.

   Deno (Supabase Edge Function).
───────────────────────────────────────────────────────────────────────── */

import { handlePreflight, json } from '../_shared/cors.ts'
import { authenticateUser } from '../_shared/clerk.ts'
import { db, livePlanForCustomer } from '../_shared/kelviq.ts'
import { ANNOTATION_CAP } from '../_shared/plans.ts'

const WINDOW_MS = 24 * 60 * 60 * 1000
const EVENTS_TABLE = 'annotation_events'

interface Usage {
  used: number
  /** ms until the oldest in-window event ages out, or null when none. */
  resetsInMs: number | null
}

/** Count this user's events for a domain inside the 24h window, and derive the
    reset clock from the oldest in-window event. */
async function readUsage(userId: string, domain: string): Promise<Usage> {
  const client = db()
  const windowStartIso = new Date(Date.now() - WINDOW_MS).toISOString()

  const { count, error } = await client
    .from(EVENTS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('clerk_user_id', userId)
    .eq('domain', domain)
    .gt('created_at', windowStartIso)
  if (error) throw new Error(error.message)

  const used = count ?? 0
  if (used === 0) return { used: 0, resetsInMs: null }

  const { data, error: oldestErr } = await client
    .from(EVENTS_TABLE)
    .select('created_at')
    .eq('clerk_user_id', userId)
    .eq('domain', domain)
    .gt('created_at', windowStartIso)
    .order('created_at', { ascending: true })
    .limit(1)
  if (oldestErr) throw new Error(oldestErr.message)

  const oldest = data?.[0]?.created_at
  const resetsInMs = oldest
    ? Math.max(0, new Date(oldest).getTime() + WINDOW_MS - Date.now())
    : null
  return { used, resetsInMs }
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticateUser(req)
  if (!auth.ok) {
    console.error('[annotation-quota] auth failed:', auth.reason)
    return json({ error: 'Unauthorized', reason: auth.reason }, 401)
  }
  const userId = auth.user.userId

  let payload: { action?: unknown; domain?: unknown }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const action = payload.action === 'reserve' ? 'reserve' : 'status'
  const domain =
    typeof payload.domain === 'string' ? payload.domain.trim() : ''
  if (!domain) return json({ error: 'domain is required' }, 400)

  try {
    const live = await livePlanForCustomer(userId)
    const limit = ANNOTATION_CAP[live.plan] // number | null (null = unlimited)

    const usage = await readUsage(userId, domain)

    if (action === 'reserve') {
      const allowed = limit === null || usage.used < limit
      if (!allowed) {
        return json({ allowed: false, ...usage, limit })
      }
      const { error } = await db()
        .from(EVENTS_TABLE)
        .insert({ clerk_user_id: userId, domain })
      if (error) throw new Error(error.message)
      return json({
        allowed: true,
        used: usage.used + 1,
        // The reset clock starts now if this is the first event in the window.
        resetsInMs: usage.resetsInMs ?? WINDOW_MS,
        limit,
      })
    }

    return json({ ...usage, limit })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Quota check failed'
    return json({ error: message }, 502)
  }
})

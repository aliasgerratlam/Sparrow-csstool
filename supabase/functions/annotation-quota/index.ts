/* ─────────────────────────────────────────────────────────────────────────
   annotation-quota — server-authoritative per-user / per-domain annotation cap.

   Why this exists: the cap NUMBER comes from the Kelviq entitlement, but the
   usage COUNT used to be 100% client-side (a localStorage ledger keyed by
   hostname). Clearing localStorage — or a fresh/incognito profile — reset the
   count to 0, so the cap was trivially bypassable. This function moves the
   count to the backend, keyed to the caller's Clerk identity (verified
   server-side), so it survives a storage wipe and can't be reset from devtools.

   Model: ONE counter row per (clerk_user_id, domain) in `annotation_quota`,
   mutated atomically by the SECURITY DEFINER SQL functions (see schema.sql).
   Reset is FIXED 24h FROM EXHAUSTION: the whole quota returns to 0 exactly 24h
   after the cap is hit — not a rolling per-event window.

     action:'status'  → { used, limit, resetsInMs }         (read-only)
     action:'reserve' → reserve one slot atomically;
                        { allowed, used, limit, resetsInMs }

   `limit` is a number, or null for unlimited (Max). `resetsInMs` is null until
   the cap is exhausted, then counts down to the reset.

   Auth: the caller's Clerk session token (x-clerk-token), verified server-side.
   Trusted-backend pattern, identical to the kelviq-* functions:
   verify_jwt = false (so the gateway doesn't 401 the CORS preflight) +
   authenticateUser(req) + service-role DB access (bypasses RLS).

   Deno (Supabase Edge Function) — never goes through the app's `tsc -b`.
───────────────────────────────────────────────────────────────────────── */

import { handlePreflight, json } from '../_shared/cors.ts'
import { authenticateUser } from '../_shared/clerk.ts'
import { db, livePlanForCustomer } from '../_shared/kelviq.ts'
import { ANNOTATION_CAP } from '../_shared/plans.ts'

/** Cap the SQL functions understand: -1 = unlimited (from a null entitlement). */
function capForRpc(limit: number | null): number {
  return limit === null ? -1 : limit
}

/** ms (server-computed) coerced to a finite number, or null. */
function toResetMs(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
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

    if (action === 'reserve') {
      const { data, error } = await db().rpc('reserve_annotation', {
        p_user: userId,
        p_domain: domain,
        p_cap: capForRpc(limit),
      })
      if (error) throw new Error(error.message)
      const row = Array.isArray(data) ? data[0] : data
      return json({
        allowed: !!row?.allowed,
        used: Number(row?.used ?? 0),
        resetsInMs: toResetMs(row?.resets_in_ms),
        limit,
      })
    }

    const { data, error } = await db().rpc('get_annotation_quota', {
      p_user: userId,
      p_domain: domain,
    })
    if (error) throw new Error(error.message)
    const row = Array.isArray(data) ? data[0] : data
    return json({
      used: Number(row?.used ?? 0),
      resetsInMs: toResetMs(row?.resets_in_ms),
      limit,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Quota check failed'
    console.error('[annotation-quota] failed:', message)
    return json({ error: message }, 502)
  }
})

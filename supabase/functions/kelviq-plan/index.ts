/* ─────────────────────────────────────────────────────────────────────────
   kelviq-plan — resolve the caller's CURRENT subscription plan, live.

   Why this exists: the web app gates on live Kelviq entitlements (React SDK),
   but the browser extension can't run that SDK on arbitrary host pages. It used
   to read the plan only from Clerk publicMetadata — which is written solely by
   the kelviq-webhook. If the webhook isn't wired (or is still settling right
   after checkout), that metadata is stale/empty and the extension wrongly shows
   Free even though the user is subscribed.

   This function reads the SAME live source the browser does (Kelviq's REST
   subscription list) and returns the resolved plan. It also self-heals Clerk
   publicMetadata so the account page and any other metadata reader agree — so a
   single call from the extension keeps every surface in sync.

   Auth: the caller's Clerk session token (x-clerk-token), verified server-side.

   Deno (Supabase Edge Function). Registered with verify_jwt = false so the
   gateway doesn't 401 the CORS preflight — we do our own auth.
───────────────────────────────────────────────────────────────────────── */

import { handlePreflight, json } from '../_shared/cors.ts'
import { requireUser, updateClerkPlan } from '../_shared/clerk.ts'
import { livePlanForCustomer } from '../_shared/kelviq.ts'

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const user = await requireUser(req)
  if (!user) return json({ error: 'Unauthorized' }, 401)

  try {
    const live = await livePlanForCustomer(user.userId)

    // Best-effort self-heal: keep Clerk metadata (account page, non-live
    // readers) in step with what we just resolved live. Never fail the request
    // on a metadata write error — the live answer is what the caller needs.
    try {
      await updateClerkPlan(user.userId, {
        plan: live.plan,
        billingCycle: live.billingCycle,
        renewsAt: live.renewsAt,
        status: live.status,
      })
    } catch (_) {
      /* metadata mirror is best-effort */
    }

    return json(live)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not resolve plan'
    return json({ error: message }, 502)
  }
})

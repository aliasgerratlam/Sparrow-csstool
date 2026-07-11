/* ─────────────────────────────────────────────────────────────────────────
   kelviq-subscription — mutate an existing subscription (upgrade / downgrade /
   cancel) for the authenticated caller.

   Ownership: the node SDK can't fetch a subscription by id, so we verify the
   subscriptionId belongs to the caller via the mirrored `subscriptions` table
   (kept current by kelviq-webhook) before acting — otherwise a caller could
   pass someone else's id.

   Actions:
     update  → subscriptions.update (change plan / cycle)
     cancel  → subscriptions.cancel (default CURRENT_PERIOD_ENDS)

   There is no "resume" action: Kelviq has no resume endpoint and its update
   endpoint rejects a cancelling subscription ("Subscription does not exists"),
   so reversing a scheduled cancel is handled in the hosted customer portal.

   Deno (Supabase Edge Function). verify_jwt = false (we do our own auth).
───────────────────────────────────────────────────────────────────────── */

import { handlePreflight, json } from '../_shared/cors.ts'
import { requireUser } from '../_shared/clerk.ts'
import { kelviqClient, ownsSubscription } from '../_shared/kelviq.ts'

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const user = await requireUser(req)
  if (!user) return json({ error: 'Unauthorized' }, 401)

  let body: {
    action?: 'update' | 'cancel'
    subscriptionId?: string
    planIdentifier?: string
    chargePeriod?: string
    cancellationType?: 'IMMEDIATE' | 'CURRENT_PERIOD_ENDS'
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const { action, subscriptionId } = body
  if (!action || !subscriptionId) {
    return json({ error: 'Missing action / subscriptionId' }, 400)
  }

  // Confirm the subscription belongs to the caller.
  if (!(await ownsSubscription(user.userId, subscriptionId))) {
    return json({ error: 'Subscription not found' }, 404)
  }

  try {
    const kelviq = kelviqClient()

    if (action === 'cancel') {
      await kelviq.subscriptions.cancel({
        subscriptionId,
        // deno-lint-ignore no-explicit-any
        cancellationType: (body.cancellationType ?? 'CURRENT_PERIOD_ENDS') as any,
      })
      return json({ ok: true })
    }

    if (!body.planIdentifier || !body.chargePeriod) {
      return json({ error: 'Missing planIdentifier / chargePeriod' }, 400)
    }
    await kelviq.subscriptions.update({
      subscriptionId,
      planIdentifier: body.planIdentifier,
      // deno-lint-ignore no-explicit-any
      chargePeriod: body.chargePeriod as any,
    })
    return json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Subscription update failed'
    return json({ error: message }, 502)
  }
})

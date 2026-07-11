/* ─────────────────────────────────────────────────────────────────────────
   kelviq-webhook — receive Kelviq events and mirror subscription state.

   On subscription / checkout / invoice events we:
     1. upsert a row in the `subscriptions` table (audit trail + the ownership
        source for kelviq-subscription), and
     2. write the plan into the user's Clerk publicMetadata (what userPlan()
        reads and what the browser extension gates on).

   Feature access in the web app is read LIVE from Kelviq entitlements, so it
   already reflects renewals / failed-payment expiry without this — the mirror
   exists for the account page, the extension, and record-keeping.

   Security: the signature is verified with validateEvent before we trust the
   payload. Registered with verify_jwt = false (Kelviq sends no Supabase JWT).

   Deno (Supabase Edge Function).
───────────────────────────────────────────────────────────────────────── */

import { validateEvent, WebhookVerificationError } from 'npm:@kelviq/node-sdk@2'
import { db, SUBSCRIPTIONS_TABLE } from '../_shared/kelviq.ts'
import { updateClerkPlan } from '../_shared/clerk.ts'

const WEBHOOK_SECRET = Deno.env.get('KELVIQ_WEBHOOK_SECRET') ?? ''

/** Events that carry a subscription snapshot we want to mirror. */
const MIRROR_EVENTS = new Set([
  'subscription.created',
  'subscription.updated',
  'subscription.cancelled',
  'subscription.plan_changed',
  'checkout.completed',
  'invoice.paid',
])

function normalizePlan(identifier: unknown): string {
  const v = String(identifier ?? '').toLowerCase()
  return v === 'pro' || v === 'max' ? v : 'free'
}

function normalizeCycle(recurrence: unknown): string | null {
  const r = String(recurrence ?? '').toUpperCase()
  if (r === 'MONTHLY') return 'monthly'
  if (r === 'YEARLY') return 'yearly'
  return null
}

// deno-lint-ignore no-explicit-any
function pick(obj: any, ...keys: string[]): any {
  for (const k of keys) {
    if (obj && obj[k] != null) return obj[k]
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }
  if (!WEBHOOK_SECRET) {
    return new Response('Webhook not configured', { status: 500 })
  }

  const rawBody = await req.text()
  const headers = Object.fromEntries(req.headers) as Record<string, string>

  // deno-lint-ignore no-explicit-any
  let event: any
  try {
    event = validateEvent(rawBody, headers, WEBHOOK_SECRET)
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return new Response('Invalid signature', { status: 400 })
    }
    return new Response('Bad request', { status: 400 })
  }

  const type = String(event?.type ?? '')
  if (!MIRROR_EVENTS.has(type)) {
    // Acknowledge everything else so Kelviq doesn't retry.
    return new Response(JSON.stringify({ received: true }), { status: 200 })
  }

  try {
    const object = event?.data?.object ?? {}
    // customerId is the Clerk user id (we set it at checkout).
    const clerkUserId = String(pick(object, 'customerId', 'customer_id') ?? '')
    if (!clerkUserId) {
      return new Response(JSON.stringify({ received: true }), { status: 200 })
    }

    const plan = pick(object, 'plan')
    const planId = normalizePlan(pick(plan ?? {}, 'identifier') ?? object.planIdentifier)
    const status = String(pick(object, 'status') ?? (type === 'subscription.cancelled' ? 'cancelled' : 'active'))
    const billingCycle = normalizeCycle(pick(object, 'recurrence'))
    const renewsAt = pick(object, 'billingPeriodEndTime', 'billing_period_end_time')
    const endsAt = pick(object, 'endDate', 'end_date')
    const subscriptionId = String(pick(object, 'id', 'subscriptionId') ?? '')

    // 1 — mirror into the subscriptions table (idempotent upsert by sub id).
    if (subscriptionId) {
      await db()
        .from(SUBSCRIPTIONS_TABLE)
        .upsert(
          {
            clerk_user_id: clerkUserId,
            kelviq_customer_id: clerkUserId,
            kelviq_subscription_id: subscriptionId,
            plan: planId,
            billing_cycle: billingCycle,
            status,
            renews_at: renewsAt,
            ends_at: endsAt,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'kelviq_subscription_id' },
        )
    }

    // 2 — mirror the plan into Clerk metadata. A cancelled/expired sub drops
    // the user back to Free so gated surfaces (extension / account) reflect it.
    const activeish =
      status.toLowerCase() === 'active' ||
      status.toLowerCase() === 'trialing' ||
      status.toLowerCase() === 'past_due'
    await updateClerkPlan(clerkUserId, {
      plan: activeish ? planId : 'free',
      billingCycle,
      renewsAt: renewsAt ?? null,
      status,
    })
  } catch (err) {
    // Log and 500 so Kelviq retries (idempotent upsert makes retries safe).
    console.error('kelviq-webhook processing error', err)
    return new Response('Processing error', { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 })
})

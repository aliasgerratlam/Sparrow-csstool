/* ─────────────────────────────────────────────────────────────────────────
   Shared Kelviq Node SDK client + Supabase (service-role) helpers for the
   Kelviq Edge Functions (Deno). The server key never reaches the browser.
───────────────────────────────────────────────────────────────────────── */

import { Kelviq } from 'npm:@kelviq/node-sdk@2'
import { createClient } from 'npm:@supabase/supabase-js@2'

const KELVIQ_SERVER_KEY = Deno.env.get('KELVIQ_SERVER_KEY') ?? ''
const KELVIQ_ENV: 'production' | 'sandbox' =
  Deno.env.get('KELVIQ_ENV') === 'live' ? 'production' : 'sandbox'

/* Kelviq's main REST API (not the edge/entitlements host). The node SDK has no
   "list subscriptions by customer" method, so ownsSubscription() calls this
   endpoint directly — it's the same source the browser react-sdk reads. */
const KELVIQ_API_BASE =
  KELVIQ_ENV === 'production'
    ? 'https://api.kelviq.com/api/v1'
    : 'https://sandboxapi.kelviq.com/api/v1'

export function kelviqClient(): Kelviq {
  if (!KELVIQ_SERVER_KEY) throw new Error('KELVIQ_SERVER_KEY is not set')
  return new Kelviq({ accessToken: KELVIQ_SERVER_KEY, environment: KELVIQ_ENV })
}

/* Supabase service-role client — bypasses RLS for server-side writes to the
   subscriptions table (SUPABASE_URL + SERVICE_ROLE_KEY are injected into the
   Edge runtime automatically). */
export const SUBSCRIPTIONS_TABLE = 'subscriptions'

export function db() {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

// deno-lint-ignore no-explicit-any
function pick(obj: any, ...keys: string[]): any {
  for (const k of keys) {
    if (obj && obj[k] != null) return obj[k]
  }
  return null
}

function normalizePlanId(v: unknown): 'free' | 'pro' | 'max' {
  const s = String(v ?? '').toLowerCase()
  return s === 'pro' || s === 'max' ? s : 'free'
}

function normalizeCycle(r: unknown): 'monthly' | 'yearly' | null {
  const s = String(r ?? '').toUpperCase()
  if (s === 'MONTHLY') return 'monthly'
  if (s === 'YEARLY') return 'yearly'
  return null
}

/** Statuses that still grant access (mirrors the webhook's `activeish`). */
const ACTIVEISH = new Set(['active', 'trialing', 'past_due'])
/** Tier ordering so we resolve to the highest active plan if several exist. */
const TIER_RANK: Record<'free' | 'pro' | 'max', number> = { free: 0, pro: 1, max: 2 }

export interface LivePlan {
  plan: 'free' | 'pro' | 'max'
  billingCycle: 'monthly' | 'yearly' | null
  renewsAt: string | null
  status: string | null
}

const NO_PLAN: LivePlan = {
  plan: 'free',
  billingCycle: null,
  renewsAt: null,
  status: null,
}

/** Resolve a customer's CURRENT plan from Kelviq's live subscription list — the
    same source the browser react-sdk reads. Used by the kelviq-plan function so
    the browser extension reflects purchases immediately, without depending on
    the webhook having mirrored the plan into Clerk metadata. Fails to Free on
    any error (fail-closed, matching every other gate). */
export async function livePlanForCustomer(customerId: string): Promise<LivePlan> {
  if (!KELVIQ_SERVER_KEY) return NO_PLAN
  try {
    const url =
      `${KELVIQ_API_BASE}/subscriptions/?customer_id=${encodeURIComponent(customerId)}`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${KELVIQ_SERVER_KEY}`,
        Accept: 'application/json',
      },
    })
    if (!res.ok) return NO_PLAN
    const body = await res.json()
    const results = body?.results ?? body?.data?.results
    if (!Array.isArray(results)) return NO_PLAN

    let best = NO_PLAN
    for (const sub of results) {
      const status = String(pick(sub, 'status') ?? '').toLowerCase()
      if (!ACTIVEISH.has(status)) continue
      const plan = normalizePlanId(
        pick(pick(sub, 'plan') ?? {}, 'identifier') ?? pick(sub, 'planIdentifier'),
      )
      if (TIER_RANK[plan] < TIER_RANK[best.plan]) continue
      best = {
        plan,
        billingCycle: normalizeCycle(pick(sub, 'recurrence')),
        renewsAt: pick(sub, 'billingPeriodEndTime', 'billing_period_end_time'),
        status,
      }
    }
    return best
  } catch {
    return NO_PLAN
  }
}

/** Confirm a subscription id belongs to this user. Guards subscription
    mutations so a caller can't act on someone else's subscription id.

    Two sources, in order of cost:
      1. the webhook-mirrored `subscriptions` table (a cheap local read), then
      2. Kelviq's live subscription list for the customer (customerId = Clerk
         user id, set at checkout).

    The live fallback matters because the mirror is only populated by the
    webhook: if the Kelviq webhook isn't configured yet, or is still settling
    right after checkout, the table is empty and a legitimately-subscribed user
    would otherwise be rejected with a spurious "not found" — even though the
    browser (which reads the same live list) correctly shows the subscription. */
export async function ownsSubscription(
  userId: string,
  subscriptionId: string,
): Promise<boolean> {
  const { data } = await db()
    .from(SUBSCRIPTIONS_TABLE)
    .select('kelviq_subscription_id')
    .eq('clerk_user_id', userId)
    .eq('kelviq_subscription_id', subscriptionId)
    .maybeSingle()
  if (data) return true
  return ownsSubscriptionLive(userId, subscriptionId)
}

/** Live ownership check against Kelviq: GET the customer's subscriptions and
    confirm the id is among them. Returns false (deny) on any error so the guard
    always fails closed. */
async function ownsSubscriptionLive(
  customerId: string,
  subscriptionId: string,
): Promise<boolean> {
  if (!KELVIQ_SERVER_KEY) return false
  try {
    const url =
      `${KELVIQ_API_BASE}/subscriptions/?customer_id=${encodeURIComponent(customerId)}`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${KELVIQ_SERVER_KEY}`,
        Accept: 'application/json',
      },
    })
    if (!res.ok) return false
    const body = await res.json()
    // The API returns a paginated { results: [...] }; be defensive about shape.
    const results = body?.results ?? body?.data?.results
    if (!Array.isArray(results)) return false
    return results.some((s) => s?.id === subscriptionId)
  } catch {
    return false
  }
}

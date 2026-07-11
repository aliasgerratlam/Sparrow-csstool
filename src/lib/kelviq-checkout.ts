/* ─────────────────────────────────────────────────────────────────────────
   Kelviq subscription actions — client helper.

   Kelviq is a Merchant of Record with HOSTED checkout + a self-serve customer
   portal, so the browser never touches card data or the server key. This
   module only orchestrates the Supabase Edge Functions (which hold the server
   key) and redirects the browser to Kelviq-hosted pages:

     startCheckout      → kelviq-checkout   → redirect to hosted checkout
     changePlan         → kelviq-subscription (update)  — upgrade / downgrade
     cancelSubscription → kelviq-subscription (cancel)
     openPortal         → kelviq-portal      → redirect to customer portal

   Reversing a scheduled cancellation ("resume") has no Kelviq API — the
   update endpoint rejects a cancelling subscription — so it's handled in the
   hosted customer portal (openPortal), not here.

   Like the checkout functions, these require BOTH a Kelviq client config AND a
   configured Supabase client (to invoke the functions) — see isKelviqConfigured.
   Every mutating call is authenticated with the caller's Clerk session token
   (x-clerk-token), which the functions verify before acting.
───────────────────────────────────────────────────────────────────────── */

import { supabase } from './supabase'
import { isKelviqConfigured } from './kelviq'
import type { PlanId } from './plans'

export type BillingCycle = 'monthly' | 'yearly'

/** Kelviq chargePeriod values. */
function chargePeriod(cycle: BillingCycle): 'MONTHLY' | 'YEARLY' {
  return cycle === 'monthly' ? 'MONTHLY' : 'YEARLY'
}

export type ActionResult =
  | { status: 'ok' }
  | { status: 'redirecting' }
  | { status: 'failed'; message: string }

type GetToken = () => Promise<string | null>

function errText(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message
    if (typeof m === 'string' && m) return m
  }
  return fallback
}

/** Invoke an Edge Function with the Clerk token attached. Never rejects —
    returns the parsed data or throws only the invoke error (caught by callers). */
async function invoke<T>(
  fn: string,
  body: Record<string, unknown>,
  getToken: GetToken,
): Promise<T> {
  if (!isKelviqConfigured || !supabase) {
    throw new Error('Subscriptions are not configured')
  }
  const token = await getToken()
  const { data, error } = await supabase.functions.invoke(fn, {
    headers: token ? { 'x-clerk-token': token } : undefined,
    body,
  })
  if (error) throw error
  return data as T
}

/** Start a NEW subscription: creates a hosted checkout session and redirects
    the browser to it. On success the browser navigates away (never returns
    'ok'); Kelviq returns the user to successUrl after payment. */
export async function startCheckout(args: {
  planId: Exclude<PlanId, 'free'>
  cycle: BillingCycle
  getToken: GetToken
}): Promise<ActionResult> {
  const successUrl = `${window.location.origin}/account?checkout=success`
  try {
    const { checkoutUrl } = await invoke<{ checkoutUrl: string }>(
      'kelviq-checkout',
      {
        planIdentifier: args.planId,
        chargePeriod: chargePeriod(args.cycle),
        successUrl,
      },
      args.getToken,
    )
    if (!checkoutUrl) return { status: 'failed', message: 'No checkout URL' }
    window.location.href = checkoutUrl
    return { status: 'redirecting' }
  } catch (err) {
    return { status: 'failed', message: errText(err, 'Could not start checkout') }
  }
}

/** Upgrade / downgrade an existing subscription in place (no checkout). */
export async function changePlan(args: {
  subscriptionId: string
  planId: Exclude<PlanId, 'free'>
  cycle: BillingCycle
  getToken: GetToken
}): Promise<ActionResult> {
  try {
    await invoke(
      'kelviq-subscription',
      {
        action: 'update',
        subscriptionId: args.subscriptionId,
        planIdentifier: args.planId,
        chargePeriod: chargePeriod(args.cycle),
      },
      args.getToken,
    )
    return { status: 'ok' }
  } catch (err) {
    return { status: 'failed', message: errText(err, 'Could not change plan') }
  }
}

/** Cancel a subscription (defaults to end-of-period so access lasts the term). */
export async function cancelSubscription(args: {
  subscriptionId: string
  getToken: GetToken
  cancellationType?: 'IMMEDIATE' | 'CURRENT_PERIOD_ENDS'
}): Promise<ActionResult> {
  try {
    await invoke(
      'kelviq-subscription',
      {
        action: 'cancel',
        subscriptionId: args.subscriptionId,
        cancellationType: args.cancellationType ?? 'CURRENT_PERIOD_ENDS',
      },
      args.getToken,
    )
    return { status: 'ok' }
  } catch (err) {
    return { status: 'failed', message: errText(err, 'Could not cancel') }
  }
}

/** Open Kelviq's hosted customer portal (invoices, payment methods, history).
    Also the resume path: reversing a scheduled cancellation is done here,
    since Kelviq exposes no resume API. */
export async function openPortal(getToken: GetToken): Promise<ActionResult> {
  try {
    const { portalUrl } = await invoke<{ portalUrl: string }>(
      'kelviq-portal',
      {},
      getToken,
    )
    if (!portalUrl) return { status: 'failed', message: 'No portal URL' }
    window.location.href = portalUrl
    return { status: 'redirecting' }
  } catch (err) {
    return { status: 'failed', message: errText(err, 'Could not open portal') }
  }
}

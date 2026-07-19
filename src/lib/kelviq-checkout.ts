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
import { toPlanId, type PlanId } from './plans'

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
  if (error) throw new Error(await edgeErrorMessage(error))
  return data as T
}

/** supabase-js surfaces a non-2xx Edge Function response as a FunctionsHttpError
    whose `.message` is generic ("...non-2xx status code") — the actionable
    detail is in the response body (`{ error, reason }`), reachable via
    `error.context`. Pull that out so callers show the real cause (e.g. why a
    401 happened) instead of an opaque message. */
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
      /* body wasn't JSON — fall through to the generic message. */
    }
  }
  return errText(error, 'Request failed')
}

/* ─────────────────────────────────────────────────────────────────────────
   Pending-checkout flag. Kelviq's hosted checkout is redirect-based and its
   API takes ONLY a successUrl (no cancelUrl — see the node SDK's
   CreateCheckoutSessionPayload), so a declined card or an abandoned checkout
   never redirects back to us; the browser just stays on Kelviq's page until the
   user hits Back. To still notice that, we stash a short-lived flag right before
   navigating away: the success handler clears it (kelviq returned via
   successUrl), so if a returning visitor still has it set, checkout did NOT
   complete. sessionStorage (per-tab) is the right scope — it clears on tab
   close and survives the same-tab Back navigation.
───────────────────────────────────────────────────────────────────────── */
const CHECKOUT_PENDING_KEY = 'kelviq:checkout-pending'
/** Ignore a flag older than this so a stale sessionStorage entry can't fire a
    spurious "not completed" toast on an unrelated later visit to the page. */
const PENDING_TTL_MS = 15 * 60 * 1000

function markCheckoutPending(planId: PlanId): void {
  try {
    sessionStorage.setItem(
      CHECKOUT_PENDING_KEY,
      JSON.stringify({ planId, at: Date.now() }),
    )
  } catch {
    /* storage unavailable (private mode / quota) — skip; the toast is a nicety. */
  }
}

/** Read + clear the pending-checkout flag. Returns the planId when a checkout
    was started (within the freshness window) and NOT completed — the success
    handler clears the flag — else null. Idempotent: clears on read. */
export function consumeCheckoutPending(): PlanId | null {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_PENDING_KEY)
    if (!raw) return null
    sessionStorage.removeItem(CHECKOUT_PENDING_KEY)
    const parsed = JSON.parse(raw) as { planId?: unknown; at?: unknown }
    if (typeof parsed.at !== 'number' || Date.now() - parsed.at > PENDING_TTL_MS)
      return null
    return parsed.planId === 'pro' || parsed.planId === 'max'
      ? parsed.planId
      : null
  } catch {
    return null
  }
}

/** Clear the pending-checkout flag without acting on it — called by the
    success handler so a returning visitor isn't told checkout "didn't finish". */
export function clearCheckoutPending(): void {
  try {
    sessionStorage.removeItem(CHECKOUT_PENDING_KEY)
  } catch {
    /* ignore */
  }
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
    // Mark in-flight only now that we're actually navigating to Kelviq (an
    // earlier failure returns above without setting the flag).
    markCheckoutPending(args.planId)
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

export interface LivePlan {
  planId: PlanId
  billingCycle: BillingCycle | null
  renewsAt: string | null
  status: string | null
}

/** Resolve the caller's CURRENT plan live, server-side, via the kelviq-plan
    Edge Function.

    The browser Kelviq React SDK CANNOT read the subscriptions endpoint: it
    authenticates with the client (publishable) key, which that endpoint rejects
    with 403 "Authentication credentials were not provided" (only the server key
    is accepted there — see the Edge Functions' livePlanForCustomer). So the web
    app resolves the plan through this function instead — it reads the live
    subscription with the server key AND self-heals Clerk publicMetadata, so a
    subsequent reloadUser() reflects the real plan on every surface (account
    page + pricing cards). Returns null when subscriptions aren't configured or
    on any error. */
export async function resolveLivePlan(getToken: GetToken): Promise<LivePlan | null> {
  if (!isKelviqConfigured || !supabase) return null
  try {
    const data = await invoke<{
      plan?: string
      billingCycle?: string | null
      renewsAt?: string | null
      status?: string | null
    }>('kelviq-plan', {}, getToken)
    if (!data || typeof data.plan !== 'string') return null
    const cycle = data.billingCycle
    return {
      planId: toPlanId(data.plan),
      billingCycle:
        cycle === 'monthly' ? 'monthly' : cycle === 'yearly' ? 'yearly' : null,
      renewsAt: data.renewsAt ?? null,
      status: data.status ?? null,
    }
  } catch {
    return null
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

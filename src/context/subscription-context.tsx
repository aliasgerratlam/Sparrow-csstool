import { createContext, useContext, useEffect } from 'react'
import { toast } from 'sonner'
import { limitsForPlan, PLAN_LIMITS, type PlanId, type PlanLimits } from '@/lib/plans'
import { store } from '@/hooks/use-annotations'

/* ─────────────────────────────────────────────────────────────────────────
   Subscription / entitlements context — the single gate the whole app reads.
   This module is FRAMEWORK-PURE (no Kelviq SDK), so both the web app and the
   browser-extension content bundle can import it cheaply.

   Feature access is resolved through two different providers that both feed
   this one context:
     - Web app: live Kelviq entitlements (see context/kelviq-provider.tsx) —
       reflects renewals / cancellations / failed-payment expiry automatically.
     - Extension: the plan id synced into Clerk metadata (it can't run the
       Kelviq SDK on host pages) → PLAN_LIMITS lookup (valueForPlan).

   Fail-closed: signed-out / loading falls back to Free; only the prototype
   (Kelviq unconfigured) is fully ungated. Every gate consumes useEntitlements()
   and never knows which provider is behind it.
───────────────────────────────────────────────────────────────────────── */

export interface SubscriptionInfo {
  id: string
  /** Raw Kelviq status string (e.g. 'active', 'trialing', 'cancelled'). */
  status: string
  planId: PlanId
  billingCycle: 'monthly' | 'yearly' | null
  /** ISO date the current period ends / next renewal. */
  renewsAt: string | null
  /** ISO date the subscription is scheduled to end (set when cancelling). */
  endsAt: string | null
  amount: string
  currency: string
}

export interface SubscriptionValue extends PlanLimits {
  planId: PlanId
  /** The current subscription, when one is active (null on Free). */
  subscription: SubscriptionInfo | null
  /** True while entitlements/subscriptions are still loading. */
  isLoading: boolean
  /** Re-fetch entitlements + subscriptions from Kelviq (no-op on fallback). */
  refresh: () => Promise<void>
}

/** Free-tier value — signed-out / loading fallback when Kelviq IS configured. */
export const FREE_VALUE: SubscriptionValue = {
  ...PLAN_LIMITS.free,
  planId: 'free',
  subscription: null,
  isLoading: false,
  refresh: async () => {},
}

/** Ungated value — used when Kelviq isn't configured at all (prototype mode),
    so the app behaves exactly like the localStorage-only prototype: every
    feature open, unlimited annotations. */
export const UNGATED_VALUE: SubscriptionValue = {
  colorFormat: true,
  colorMode: true,
  fontMode: true,
  assets: true,
  annotationLimit: Infinity,
  planId: 'free',
  subscription: null,
  isLoading: false,
  refresh: async () => {},
}

/** Build a static value from a plan id — the extension's resolution path. */
export function valueForPlan(planId: PlanId): SubscriptionValue {
  return {
    ...limitsForPlan(planId),
    planId,
    subscription: null,
    isLoading: false,
    refresh: async () => {},
  }
}

/* Default = ungated, so useEntitlements() is safe with no provider and never
   spuriously locks features (the web/extension providers narrow it). */
export const SubscriptionContext = createContext<SubscriptionValue>(UNGATED_VALUE)

export function useEntitlements(): SubscriptionValue {
  return useContext(SubscriptionContext)
}

/* ─────────────────────────────────────────────────────────────────────────
   Keeps the framework-agnostic annotation store's per-domain cap in sync with
   the live entitlement, so the store can hard-enforce it without importing any
   React/Kelviq code. Mount once inside any subscription provider.
───────────────────────────────────────────────────────────────────────── */
export function AnnotationLimitSync() {
  const { annotationLimit } = useEntitlements()
  useEffect(() => {
    store.setAnnotationLimit(annotationLimit)
  }, [annotationLimit])
  return null
}

/** Navigate the user to the pricing cards: smooth-scroll if they're already on
    a page that has the section; in the extension open the web app's pricing in
    a new tab (never navigate the host page); else full-nav to /#pricing. */
export function goToPricing() {
  // In the extension the scanner is injected over an arbitrary host page, so we
  // must never scroll or navigate it — always open the web app's pricing in a
  // new tab. The web app scrolls to #pricing on arrival (hash effect in App.tsx).
  if (import.meta.env.VITE_IS_EXTENSION) {
    const base = (
      import.meta.env.VITE_EXT_WEB_APP_URL || 'https://www.trysparrowcss.com'
    ).replace(/\/+$/, '')
    window.open(`${base}/#pricing`, '_blank', 'noopener')
    return
  }
  const el = document.getElementById('pricing')
  if (el) {
    el.scrollIntoView({ behavior: 'smooth' })
    return
  }
  window.location.href = '/#pricing'
}

/** Shared upgrade nudge for any locked feature: toast + route to pricing. */
export function promptUpgrade(feature?: string) {
  toast(
    feature
      ? `${feature} is a paid feature — upgrade to unlock it.`
      : 'Upgrade your plan to unlock this feature.',
    {
      action: { label: 'See plans', onClick: goToPricing },
    },
  )
}

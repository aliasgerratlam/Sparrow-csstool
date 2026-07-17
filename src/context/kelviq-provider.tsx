import { useEffect, useMemo, type ReactNode } from 'react'
import { KelviqProvider, useKelviq } from '@kelviq/react-sdk'
import { useAuth, userPlan, type AuthUser } from '@/context/auth-context'
import {
  SubscriptionContext,
  FREE_VALUE,
  UNGATED_VALUE,
  type SubscriptionInfo,
  type SubscriptionValue,
} from '@/context/subscription-context'
import {
  KELVIQ_CLIENT_KEY,
  KELVIQ_ENVIRONMENT,
  KELVIQ_PRODUCT_ID,
  isKelviqConfigured,
} from '@/lib/kelviq'
import { resolveLivePlan } from '@/lib/kelviq-checkout'
import { FEATURE_IDS, PLAN_LIMITS, limitsForPlan } from '@/lib/plans'

/* ─────────────────────────────────────────────────────────────────────────
   Web-app subscription provider — resolves live Kelviq entitlements and feeds
   them to SubscriptionContext. Imports the Kelviq React SDK, so it lives apart
   from the SDK-free subscription-context (which the extension imports).
───────────────────────────────────────────────────────────────────────── */

/* The website is a free live demo — every tool open, unlimited annotations —
   so visitors can test-drive without signing in or paying. The paid product is
   the browser extension, which resolves entitlements through a separate provider
   (ExtensionSubscriptionProvider) and is unaffected. We spread this over the
   web value while preserving the real planId/subscription, so /account and the
   pricing cards still reflect the visitor's actual subscription. */
const DEMO_UNLOCK = {
  colorFormat: true,
  colorMode: true,
  fontMode: true,
  assets: true,
  annotationLimit: Infinity,
} as const

/* Build the displayed subscription from Clerk publicMetadata (mirrored by the
   kelviq-webhook and self-healed by kelviq-plan). We source it from metadata —
   NOT the SDK's subscriptions call — because the browser SDK's client key is
   unauthorized for Kelviq's subscriptions endpoint (403); see resolveLivePlan.
   The Kelviq subscription id isn't mirrored into metadata, so management routes
   through the hosted customer portal (openPortal), which needs no id. */
function subscriptionFromMeta(user: AuthUser | null): SubscriptionInfo | null {
  const meta = userPlan(user)
  if (!meta.isPaid) return null
  const raw = user?.metadata ?? {}
  return {
    id: typeof raw.subscription_id === 'string' ? raw.subscription_id : '',
    status:
      typeof raw.subscription_status === 'string'
        ? raw.subscription_status
        : 'active',
    planId: meta.id,
    billingCycle: meta.billingCycle,
    renewsAt: meta.renewsAt,
    endsAt: null,
    amount: '',
    currency: '',
  }
}

/* Inner resolver — must be rendered INSIDE <KelviqProvider>. */
function KelviqEntitlements({ children }: { children: ReactNode }) {
  const kq = useKelviq()
  const { user, getToken, reloadUser } = useAuth()
  const loading = kq.isLoading

  // Self-heal the plan on mount (and whenever the signed-in user changes). The
  // browser SDK can't read Kelviq's subscriptions endpoint with the client key
  // (403), so we never call it — the subscriptions fetch is disabled below.
  // Instead resolve the plan server-side via kelviq-plan (server key), which
  // mirrors it into Clerk metadata, then reload the Clerk user so the plan +
  // subscription below reflect the real subscription on every surface. This is
  // the same path the browser extension already uses.
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    void (async () => {
      const live = await resolveLivePlan(getToken)
      if (!cancelled && live) await reloadUser()
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, getToken, reloadUser])

  const value = useMemo<SubscriptionValue>(() => {
    // Plan + subscription come from Clerk metadata (webhook / kelviq-plan
    // mirror), not the SDK subscriptions call.
    const planId = userPlan(user).id
    const subscription = subscriptionFromMeta(user)

    const annotEnt = kq.getEntitlement(FEATURE_IDS.annotationsLimit)
    const annotationLimit = loading
      ? PLAN_LIMITS.free.annotationLimit
      : annotEnt
        ? // customizable/metered: null usageLimit means unlimited
          (annotEnt.usageLimit ?? Infinity)
        : limitsForPlan(planId).annotationLimit

    const live: SubscriptionValue = {
      planId,
      colorFormat: !loading && kq.hasAccess(FEATURE_IDS.colorFormat),
      colorMode: !loading && kq.hasAccess(FEATURE_IDS.colorMode),
      fontMode: !loading && kq.hasAccess(FEATURE_IDS.fontMode),
      assets: !loading && kq.hasAccess(FEATURE_IDS.assets),
      annotationLimit,
      subscription,
      isLoading: loading,
      refresh: async () => {
        const [, live] = await Promise.all([
          kq.refreshAllEntitlements(),
          resolveLivePlan(getToken),
        ])
        if (live) await reloadUser()
      },
    }
    // Live demo: unlock every feature, but keep planId/subscription real above.
    return { ...live, ...DEMO_UNLOCK }
  }, [kq, user, loading, getToken, reloadUser])

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  )
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth()

  // Kelviq not configured → prototype mode: gate nothing.
  if (!isKelviqConfigured) {
    return (
      <SubscriptionContext.Provider value={UNGATED_VALUE}>
        {children}
      </SubscriptionContext.Provider>
    )
  }

  // Configured but signed out / no id → Free tier, but the live demo unlocks
  // every tool so visitors can test-drive without signing in.
  if (!isAuthenticated || !user?.id) {
    return (
      <SubscriptionContext.Provider value={{ ...FREE_VALUE, ...DEMO_UNLOCK }}>
        {children}
      </SubscriptionContext.Provider>
    )
  }

  return (
    <KelviqProvider
      accessToken={KELVIQ_CLIENT_KEY ?? null}
      productId={KELVIQ_PRODUCT_ID}
      customerId={user.id}
      environment={KELVIQ_ENVIRONMENT}
      config={{
        fetchEntitlementsOnMount: true,
        // The subscriptions endpoint rejects the browser's client key (403), so
        // never fetch it — the plan is resolved via kelviq-plan instead (see
        // KelviqEntitlements). Leaving this on spams 403s + retries on load.
        fetchSubscriptionsOnMount: false,
      }}
    >
      <KelviqEntitlements>{children}</KelviqEntitlements>
    </KelviqProvider>
  )
}

import { useMemo, type ReactNode } from 'react'
import {
  KelviqProvider,
  useKelviq,
  type RawSubscriptionData,
} from '@kelviq/react-sdk'
import { useAuth } from '@/context/auth-context'
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
import { FEATURE_IDS, PLAN_LIMITS, limitsForPlan, toPlanId, type PlanId } from '@/lib/plans'

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

/** Statuses that grant access (the subscription is currently paying/valid). */
function isActiveStatus(status: string): boolean {
  const s = status.toLowerCase()
  return s === 'active' || s === 'trialing' || s === 'trial' || s === 'past_due'
}

function toBillingCycle(recurrence: string): 'monthly' | 'yearly' | null {
  const r = recurrence.toUpperCase()
  if (r === 'MONTHLY') return 'monthly'
  if (r === 'YEARLY') return 'yearly'
  return null
}

function pickSubscription(
  subs: RawSubscriptionData[] | null,
): SubscriptionInfo | null {
  if (!subs || subs.length === 0) return null
  const current = subs.find((s) => isActiveStatus(s.status)) ?? subs[0]
  if (!current) return null
  return {
    id: current.id,
    status: current.status,
    planId: toPlanId(current.plan?.identifier),
    billingCycle: toBillingCycle(current.recurrence),
    renewsAt: current.billingPeriodEndTime ?? null,
    endsAt: current.endDate ?? null,
    amount: current.amount,
    currency: current.currency,
  }
}

/* Inner resolver — must be rendered INSIDE <KelviqProvider>. */
function KelviqEntitlements({ children }: { children: ReactNode }) {
  const kq = useKelviq()
  const subs = kq.subscriptions
  const loading = kq.isLoading || subs.isLoading

  const value = useMemo<SubscriptionValue>(() => {
    const subscription = pickSubscription(subs.data)
    // Fail-closed: until entitlements resolve, treat as Free.
    const planId: PlanId = loading ? 'free' : (subscription?.planId ?? 'free')

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
        await Promise.all([
          kq.refreshAllEntitlements(),
          kq.refreshSubscriptions(),
        ])
      },
    }
    // Live demo: unlock every feature, but keep planId/subscription real above.
    return { ...live, ...DEMO_UNLOCK }
  }, [kq, subs.data, loading])

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
        fetchSubscriptionsOnMount: true,
      }}
    >
      <KelviqEntitlements>{children}</KelviqEntitlements>
    </KelviqProvider>
  )
}

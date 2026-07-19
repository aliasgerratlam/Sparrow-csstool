import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import {
  KelviqProvider,
  useKelviq,
  kqFormatPrice,
  type RawPricingApiResponse,
} from '@kelviq/react-sdk'
import { useAuth, userPlan, type AuthUser } from '@/context/auth-context'
import {
  SubscriptionContext,
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
import {
  FEATURE_IDS,
  PLAN_LIMITS,
  limitsForPlan,
  type PlanId,
} from '@/lib/plans'

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

/* ─────────────────────────────────────────────────────────────────────────
   Live pricing — the pricing cards read prices from Kelviq (localized to the
   visitor's currency/country) instead of the static PLAN_DISPLAY strings.
   Pricing is public (no customerId needed), so it's fetched even for signed-out
   visitors. A missing period/plan leaves the field undefined and the card falls
   back to its PLAN_DISPLAY copy.
───────────────────────────────────────────────────────────────────────── */

/** Formatted, localized price strings per plan/period (undefined = fall back). */
export type PriceMap = Partial<
  Record<PlanId, { monthly?: string; yearly?: string }>
>

/** null = no live pricing (unconfigured / still loading) → static fallback. */
const PricingContext = createContext<PriceMap | null>(null)

/** Live, localized Kelviq prices for the pricing cards (null → use PLAN_DISPLAY). */
export function useKelviqPrices(): PriceMap | null {
  return useContext(PricingContext)
}

const KNOWN_PLAN = (id: string): id is PlanId =>
  id === 'free' || id === 'pro' || id === 'max'

/** Map Kelviq's raw pricing response into formatted per-plan/period strings. */
function mapPrices(pricing: RawPricingApiResponse | null): PriceMap | null {
  if (!pricing?.plans?.length) return null
  const { currencySymbol, pricingLocale } = pricing
  const out: PriceMap = {}
  for (const plan of pricing.plans) {
    if (!KNOWN_PLAN(plan.identifier)) continue
    const charges = plan.price?.charges ?? []
    const priceFor = (period: string): string | undefined => {
      if (plan.price?.priceType === 'FREE') return undefined
      const charge = charges.find((c) => c.chargePeriod === period)
      return charge
        ? kqFormatPrice(charge.priceData.amount, currencySymbol, {
            locale: pricingLocale,
          })
        : undefined
    }
    const monthly = priceFor('MONTHLY')
    const yearly = priceFor('YEARLY')
    if (monthly || yearly) out[plan.identifier] = { monthly, yearly }
  }
  return Object.keys(out).length ? out : null
}

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

  const prices = useMemo(() => mapPrices(kq.pricing.data), [kq.pricing.data])

  return (
    <SubscriptionContext.Provider value={value}>
      <PricingContext.Provider value={prices}>
        {children}
      </PricingContext.Provider>
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

  // Configured — always mount the Kelviq provider so PUBLIC pricing is fetched
  // for the pricing cards even for signed-out visitors (pricing needs no
  // customer id). Entitlements do need a customer, so those are only fetched
  // when signed in; signed out, KelviqEntitlements degrades to Free + the live
  // demo unlock so visitors can still test-drive every tool.
  const signedIn = isAuthenticated && !!user?.id

  return (
    <KelviqProvider
      accessToken={KELVIQ_CLIENT_KEY ?? null}
      productId={KELVIQ_PRODUCT_ID}
      customerId={user?.id}
      environment={KELVIQ_ENVIRONMENT}
      config={{
        // Public pricing → live, localized prices on the pricing cards.
        fetchPricingOnMount: true,
        // Entitlements need a customer id — only fetch when signed in.
        fetchEntitlementsOnMount: signedIn,
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

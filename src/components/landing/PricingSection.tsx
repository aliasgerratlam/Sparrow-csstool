import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Icon, LpContainer, SectionBadge, SectionHeading, STACK } from './lp'
import { useAuth, userPlan } from '@/context/auth-context'
import { useEntitlements } from '@/context/subscription-context'
import { useKelviqPrices } from '@/context/kelviq-provider'
import { isKelviqConfigured } from '@/lib/kelviq'
import {
  startCheckout,
  openPortal,
  consumeCheckoutPending,
  type BillingCycle,
} from '@/lib/kelviq-checkout'
import { PLAN_DISPLAY, PLAN_IDS, type PlanId } from '@/lib/plans'
import { cn } from '@/lib/format'

type Billing = BillingCycle

/** Paid plans checkout; Free never does. */
type PaidPlanId = Exclude<PlanId, 'free'>

const CTA_STYLE: Record<PlanId, string> = {
  free: 'bg-[#f4f4f5] text-[#18181b] hover:bg-[#e4e4e7]',
  pro: 'bg-white text-lp-blue-700 hover:bg-[#eff6ff]',
  max: 'bg-lp-ink text-white hover:bg-[#27272a]',
}

export function PricingSection() {
  const [billing, setBilling] = useState<Billing>('monthly')
  // The plan id currently processing (its button shows a spinner); null when
  // idle. Doubles as the "busy" guard against concurrent actions.
  const [activePlan, setActivePlan] = useState<PlanId | null>(null)
  const { isConfigured, isAuthenticated, openLoginDialog, getToken, user } =
    useAuth()
  const { planId: currentPlan, subscription } = useEntitlements()
  // Live, localized Kelviq prices (null while loading / when unconfigured);
  // each card falls back to its static PLAN_DISPLAY copy when a value is absent.
  // `loading` is true only while the live fetch is still in flight — paid cards
  // show a skeleton then, instead of flashing the static price and swapping it.
  const { prices, loading: pricesLoading } = useKelviqPrices()
  const navigate = useNavigate()

  // Notice an abandoned / declined checkout. Kelviq's hosted checkout has no
  // cancelUrl, so a failed or dismissed payment just leaves the user on Kelviq's
  // page; they return here via Back with the in-flight flag still set (a
  // completed checkout clears it on /account). Reassure them no charge was made.
  // Runs on mount (full-reload return) and on bfcache restore (pageshow).
  useEffect(() => {
    const check = () => {
      const planId = consumeCheckoutPending()
      if (!planId) return
      toast(`Checkout for ${PLAN_DISPLAY[planId].name} wasn't completed.`, {
        description: "You weren't charged — pick a plan whenever you're ready.",
      })
    }
    check()
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) check()
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  // Which plan card gets the "Current plan" label. Prefer the live Kelviq
  // subscription's plan, but fall back to the Clerk-metadata plan (mirrored by
  // the kelviq-webhook) when the live subscription hasn't resolved — otherwise
  // this card stays on "Free" for a paying user even after a reload, since
  // (unlike the account page) it has no other source. Mirrors AccountPage.
  const effectivePlan: PlanId = subscription ? currentPlan : userPlan(user).id

  const goDemo = () =>
    document.getElementById('home')?.scrollIntoView({ behavior: 'smooth' })

  // Plan CTAs:
  //  • Free tier → account (signed in) / sign-in prompt / demo (unconfigured).
  //  • Paid, signed out → prompt sign-in (or demo when auth isn't configured).
  //  • Paid, signed in, no billing backend → route to the account page.
  //  • Paid, signed in, billing on → hosted checkout for a NEW subscription,
  //    or the hosted customer portal to switch when one already exists (the
  //    browser holds no subscription id — it can't read Kelviq's subscriptions
  //    endpoint — so plan changes go through the portal, its sanctioned door).
  const onPlanCta = async (id: PlanId) => {
    if (activePlan) return

    // Free tier — no payment.
    if (id === 'free') {
      if (isAuthenticated) navigate('/account')
      else if (isConfigured) openLoginDialog()
      else goDemo()
      return
    }
    const plan = id as PaidPlanId

    // Paid tier, signed out — prompt sign-in (or the demo without auth).
    if (!isAuthenticated) {
      if (isConfigured) openLoginDialog()
      else goDemo()
      return
    }

    // Paid tier, signed in, but no billing backend — manage on the account page.
    if (!isKelviqConfigured) {
      navigate('/account')
      return
    }

    setActivePlan(id)
    // Already on a paid plan → switch in the hosted portal; else start a new
    // hosted checkout. Both redirect the browser away on success.
    const alreadyPaid = !!subscription || effectivePlan !== 'free'
    const result = alreadyPaid
      ? await openPortal(getToken)
      : await startCheckout({ planId: plan, cycle: billing, getToken })

    if (result.status === 'redirecting') {
      // Browser is navigating to the portal / hosted checkout — keep spinner.
      return
    }
    if (result.status === 'ok') {
      toast.success('Plan updated.')
      navigate('/account')
      return
    }
    toast.error(result.message || 'Something went wrong. Please try again.')
    setActivePlan(null)
  }

  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="mt-28 lg:mt-[184px]"
    >
      <LpContainer className="flex flex-col items-center">
        <SectionBadge>Pricing</SectionBadge>
        <SectionHeading id="pricing-heading">
          Start free. Upgrade when you pin more.
        </SectionHeading>

        <div
          role="group"
          aria-label="Billing period"
          className="lp-glass mt-6 flex rounded-full border border-white/90 bg-white/65 p-1 shadow-[0_8px_24px_-12px_rgba(30,64,175,0.3)] lg:mt-8"
        >
          {(['monthly', 'yearly'] as const).map((period) => (
            <button
              key={period}
              type="button"
              aria-pressed={billing === period}
              onClick={() => setBilling(period)}
              className={cn(
                'lp-btn flex h-11 items-center gap-1.5 rounded-full border-0 px-[18px] text-sm font-medium capitalize lg:h-10 lg:gap-2 lg:px-5',
                billing === period
                  ? 'bg-lp-blue text-white'
                  : 'bg-transparent text-lp-text',
              )}
            >
              {period}
              {period === 'yearly' && (
                <span className="rounded-full bg-[#dcfce7] px-[7px] py-0.5 text-[11px] text-[#166534] normal-case lg:px-2 lg:text-xs">
                  <span className="lg:hidden">2 mo free</span>
                  <span className="hidden lg:inline">2 months free</span>
                </span>
              )}
            </button>
          ))}
        </div>

        <div
          className={cn(
            STACK,
            'mt-7 flex flex-col gap-4 lg:mt-12 lg:grid lg:grid-cols-3 lg:items-stretch lg:gap-6',
          )}
        >
          {PLAN_IDS.map((id) => {
            const plan = PLAN_DISPLAY[id]
            const pro = id === 'pro'
            const isCurrent = isAuthenticated && effectivePlan === id
            const cta = isCurrent ? 'Current plan' : plan.cta
            // Prefer the live Kelviq price for the selected cycle; fall back to
            // the static display copy while pricing loads / when unconfigured.
            const livePrice =
              billing === 'yearly' ? prices?.[id]?.yearly : prices?.[id]?.monthly
            const priceLabel =
              livePrice ??
              (billing === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice)
            // Skeleton the price only for paid plans while the live fetch is in
            // flight — Free has no live price (always $0), so it never waits.
            const showPriceSkeleton =
              pricesLoading && id !== 'free' && !livePrice
            // "Everything in Free" reads as the list's lead-in, not a bullet.
            const [first, ...rest] = plan.features
            const leadIn = first?.startsWith('Everything in') ?? false
            const features = leadIn ? rest : plan.features
            const period =
              id === 'free' ? 'forever' : billing === 'yearly' ? 'per year' : 'per month'

            return (
              <article
                key={plan.id}
                className={cn(
                  'relative flex flex-col p-[26px] lg:p-8',
                  pro
                    ? 'order-first rounded-2xl bg-lp-blue text-white shadow-[0_30px_60px_-20px_rgba(37,99,235,0.7)] lg:order-none lg:-translate-y-3'
                    : 'lp-card lp-lift',
                )}
              >
                {pro && (
                  <span className="absolute -top-3 right-5 rotate-4 rounded-full bg-[#fcd34d] px-[11px] py-[5px] text-xs font-semibold text-lp-ink shadow-[0_6px_16px_-6px_rgba(9,9,11,0.3)] lg:-top-3.5 lg:right-6 lg:px-3 lg:py-1.5">
                    Most popular
                  </span>
                )}

                {/* name + price: one row on phones for Free/Max, stacked otherwise */}
                <div
                  className={cn(
                    'lg:block',
                    !pro && 'flex items-baseline justify-between',
                  )}
                >
                  <div>
                    <h3 className="text-lg leading-7 font-semibold">{plan.name}</h3>
                    <p
                      className={cn(
                        'mt-1 hidden text-sm lg:block',
                        pro ? 'text-[#dbeafe]' : 'text-lp-muted',
                      )}
                    >
                      {plan.tagline}
                    </p>
                  </div>
                  <div
                    className={cn(
                      'flex items-baseline gap-1.5 lg:mt-6',
                      pro && 'mt-3',
                    )}
                  >
                    {showPriceSkeleton ? (
                      <span
                        aria-hidden
                        className={cn(
                          'h-9 w-24 animate-pulse rounded-md lg:h-12',
                          pro ? 'bg-white/25' : 'bg-lp-ink/10',
                        )}
                      />
                    ) : (
                      <>
                        <span
                          className={cn(
                            'font-semibold tracking-[-0.03em] lg:text-5xl lg:leading-[52px]',
                            pro
                              ? 'text-[44px] leading-[48px]'
                              : 'text-[32px] leading-9',
                          )}
                        >
                          {priceLabel}
                        </span>
                        <span
                          className={cn(
                            'text-[13px] lg:text-sm',
                            pro ? 'text-[#dbeafe]' : 'text-lp-muted',
                          )}
                        >
                          {period}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  aria-busy={activePlan === plan.id}
                  onClick={() => void onPlanCta(plan.id)}
                  className={cn(
                    'lp-btn mt-5 flex h-12 items-center justify-center rounded-full border-0 text-[15px] font-medium lg:mt-6 lg:h-11 lg:text-sm',
                    CTA_STYLE[id],
                    // phones: Free/Max list their features first, CTA last
                    !pro && 'order-last lg:order-none',
                    // Lock every button while an action is in flight.
                    activePlan && 'pointer-events-none',
                    activePlan && activePlan !== plan.id && 'opacity-60',
                    isCurrent && 'pointer-events-none opacity-70',
                  )}
                >
                  {activePlan === plan.id ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="size-5 animate-spin" />
                      Processing…
                    </span>
                  ) : (
                    cta
                  )}
                </button>

                <div
                  aria-hidden="true"
                  className={cn(
                    'my-7 mb-5 hidden h-px lg:block',
                    pro ? 'bg-white/25' : 'bg-[rgba(9,9,11,0.08)]',
                  )}
                />

                <ul
                  className={cn(
                    'flex flex-col gap-2.5 text-sm leading-5 lg:gap-3',
                    pro ? 'mt-[22px] lg:mt-0' : 'mt-4 lg:mt-0 lg:text-lp-text',
                    !pro && 'text-lp-text',
                  )}
                >
                  {leadIn && (
                    <li
                      className={cn(
                        'font-medium',
                        pro ? 'text-white' : 'text-lp-ink',
                      )}
                    >
                      {first}, plus:
                    </li>
                  )}
                  {features.map((f) => (
                    <li key={f} className="flex gap-2.5">
                      <Icon
                        name="check"
                        size={18}
                        strokeWidth={2.5}
                        className={cn('shrink-0', pro ? 'text-white' : 'text-lp-blue')}
                      />
                      {f}
                    </li>
                  ))}
                </ul>
              </article>
            )
          })}
        </div>

        <p className="mt-5 text-center text-[13px] leading-[18px] text-lp-muted lg:mt-7">
          Upgrade, downgrade or cancel anytime from your account portal.
          <span className="hidden lg:inline">
            {' '}
            Paid features stay on through the billing period.
          </span>
        </p>
      </LpContainer>
    </section>
  )
}

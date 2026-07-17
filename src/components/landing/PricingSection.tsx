import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ArrowButton, Container } from './parts'
import { useAuth, userPlan } from '@/context/auth-context'
import { useEntitlements } from '@/context/subscription-context'
import { isKelviqConfigured } from '@/lib/kelviq'
import {
  startCheckout,
  openPortal,
  type BillingCycle,
} from '@/lib/kelviq-checkout'
import { PLAN_DISPLAY, PLAN_IDS, type PlanId } from '@/lib/plans'
import { cn } from '@/lib/format'

type Billing = BillingCycle

/** Paid plans checkout; Free never does. */
type PaidPlanId = Exclude<PlanId, 'free'>

export function PricingSection() {
  const [billing, setBilling] = useState<Billing>('monthly')
  // The plan id currently processing (its button shows a spinner); null when
  // idle. Doubles as the "busy" guard against concurrent actions.
  const [activePlan, setActivePlan] = useState<PlanId | null>(null)
  const { isConfigured, isAuthenticated, openLoginDialog, getToken, user } =
    useAuth()
  const { planId: currentPlan, subscription } = useEntitlements()
  const navigate = useNavigate()

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
    <section id="pricing" aria-labelledby="pricing-heading" className="py-16 md:py-24">
      <Container>
        <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
          <h2
            id="pricing-heading"
            className="font-abeezee text-4xl font-bold leading-[1.05] tracking-tight text-sparrow-ink md:text-5xl"
          >
            Start free. Upgrade <span className="hl-word text-sparrow-blue">when it pays for itself.</span>
          </h2>

          <div
            role="group"
            aria-label="Billing period"
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sparrow-blue p-1"
          >
            {(['monthly', 'yearly'] as const).map((period) => (
              <button
                key={period}
                type="button"
                aria-pressed={billing === period}
                onClick={() => setBilling(period)}
                className={cn(
                  'cursor-pointer rounded-full px-5 py-2 font-abeezee text-sm font-medium capitalize transition-colors',
                  billing === period
                    ? 'bg-white text-sparrow-ink shadow-sm'
                    : 'text-white hover:text-white/90',
                )}
              >
                {period}
              </button>
            ))}
          </div>
        </div>

        {/* Same iPad/mobile treatment as the steps section: a horizontal
            scroll-snap slider below lg (each card peeks the next), reverting to
            the static 3-column grid at lg+. */}
        <div className="mt-12 flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:snap-none lg:grid-cols-3 lg:overflow-visible lg:pb-0">
          {PLAN_IDS.map((id) => {
            const plan = PLAN_DISPLAY[id]
            const isCurrent = isAuthenticated && effectivePlan === id
            const cta = isCurrent ? 'Current plan' : plan.cta
            return (
              <article
                key={plan.id}
                className="relative flex shrink-0 basis-[82%] snap-start flex-col overflow-hidden rounded-[20px] bg-white p-12 shadow-sm ring-1 ring-black/5 sm:basis-[56%] md:basis-[44%] lg:basis-auto"
              >
                <h3 className="font-abeezee text-2xl font-semibold text-sparrow-ink">
                  {plan.name}
                </h3>
                <p className="font-abeezee text-sm text-sparrow-ink">
                  {plan.tagline}
                </p>

                <div className="mt-6 flex items-end gap-2">
                  <span className="font-abeezee text-4xl font-semibold text-sparrow-ink">
                    {billing === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice}
                  </span>
                  <span className="mb-1 font-abeezee text-base text-sparrow-ink/60">
                    {plan.id === 'free'
                      ? 'free forever'
                      : billing === 'yearly'
                        ? 'per year'
                        : 'per month'}
                  </span>
                </div>

                <hr className="my-5 border-black/10" />

                <p className="font-abeezee text-base font-semibold text-sparrow-ink">
                  What's Included
                </p>
                <ul className="mt-3 mb-10 flex-1 space-y-1">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 font-abeezee text-sm text-sparrow-ink"
                    >
                      <Check className="mt-0.5 size-4 shrink-0 text-sparrow-blue" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <ArrowButton
                  variant={plan.ctaVariant}
                  arrow={activePlan !== plan.id && !isCurrent}
                  onClick={() => void onPlanCta(plan.id)}
                  className={cn(
                    'mt-8 w-full',
                    plan.highlight && 'relative',
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
                </ArrowButton>
              </article>
            )
          })}
        </div>
      </Container>
    </section>
  )
}

import { useEffect, useId, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuth } from '@/context/auth-context'
import { goToPricing, useEntitlements } from '@/context/subscription-context'
import { startCheckout, type BillingCycle } from '@/lib/kelviq-checkout'
import {
  PLAN_DISPLAY,
  PLAN_LIMITS,
  shareExpiryLabel,
  type PlanId,
} from '@/lib/plans'

type PaidPlan = Exclude<PlanId, 'free'>

/* Pitch line per plan, built from the real limits (PLAN_LIMITS) rather than
   hard-coded numbers, so it can never drift from what the backend enforces. */
function planBlurb(id: PaidPlan): string {
  const lim = PLAN_LIMITS[id]
  const pins = Number.isFinite(lim.annotationLimit)
    ? `${lim.annotationLimit} pins per site per day`
    : 'Unlimited pins'
  const share = Number.isFinite(lim.shareExpiryMs)
    ? `${shareExpiryLabel(lim.shareExpiryMs).replace(' days', '-day')} share links`
    : 'never-expiring share links'
  return id === 'max'
    ? `${pins} · ${share} · everything in Pro`
    : `${pins} · ${share} · color swapping, font testing, asset downloads`
}

/** "6h 12m" — the real time left until the daily pin quota resets. */
export function fmtUnlock(ms: number): string {
  const mins = Math.max(1, Math.ceil(ms / 60_000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/* "Out of pins — upgrade": the plan picker shown when the daily per-site pin
   quota is used up. Real data only — the cap/plan/reset come from the quota
   store and entitlements, prices from PLAN_DISPLAY. */
export function PinLimitUpgrade({
  open,
  onOpenChange,
  initialPlan,
  plans,
  limit,
  resetsInMs,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialPlan: PaidPlan
  /** Plans above the user's current one, in display order. */
  plans: PaidPlan[]
  limit: number
  resetsInMs: number | null
}) {
  const { planId } = useEntitlements()
  const { isAuthenticated, getToken } = useAuth()
  const [plan, setPlan] = useState<PaidPlan>(initialPlan)
  const [cycle, setCycle] = useState<BillingCycle>('monthly')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleId = useId()

  useEffect(() => {
    if (open) {
      setPlan(initialPlan)
      setError(null)
    }
  }, [open, initialPlan])

  const chosen = PLAN_DISPLAY[plan]
  const price = cycle === 'yearly' ? chosen.yearlyPrice : chosen.monthlyPrice
  const cta = `Continue with ${chosen.name} — ${price}/${cycle === 'yearly' ? 'year' : 'month'}`

  const onContinue = async () => {
    setError(null)
    // A new subscription can be started in-page on the web when signed in.
    // Everywhere else (extension, signed out, or an existing paid plan that
    // needs an in-place change) the pricing section owns the flow.
    const canCheckout =
      !import.meta.env.VITE_IS_EXTENSION && isAuthenticated && planId === 'free'
    if (!canCheckout) {
      onOpenChange(false)
      goToPricing()
      return
    }
    setBusy(true)
    try {
      const res = await startCheckout({ planId: plan, cycle, getToken })
      if (res.status === 'failed') setError(res.message)
    } finally {
      setBusy(false)
    }
  }

  const freeCap = Number.isFinite(limit) ? limit : PLAN_LIMITS.free.annotationLimit
  const current = PLAN_DISPLAY[planId].name

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="annot-upgrade-dialog sp-up-host"
        overlayStyle={{
          background: 'rgba(9,9,11,0.42)',
          backdropFilter: 'blur(3px)',
        }}
        aria-labelledby={titleId}
      >
        <div className="sp-up">
          <button
            type="button"
            className="sp-up-x"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          <div className="sp-up-art" aria-hidden="true">
            <span className="sp-up-pin" style={{ left: 188, top: 34, background: '#dc2626', color: '#fff', transform: 'rotate(-12deg)', boxShadow: '0 10px 20px -8px rgba(220,38,38,0.7)' }}>1</span>
            <span className="sp-up-pin" style={{ left: 220, top: 26, background: '#f59e0b', color: '#09090b', transform: 'rotate(4deg)', boxShadow: '0 10px 20px -8px rgba(245,158,11,0.7)' }}>2</span>
            <span className="sp-up-pin" style={{ left: 252, top: 36, background: '#2563eb', color: '#fff', transform: 'rotate(14deg)', boxShadow: '0 10px 20px -8px rgba(37,99,235,0.7)' }}>3</span>
            <span className="sp-up-lock">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
            </span>
          </div>

          <div className="sp-up-body">
            <DialogTitle asChild>
              <h2 id={titleId} className="sp-up-title">
                You&rsquo;re out of pins for today
              </h2>
            </DialogTitle>
            <DialogDescription asChild>
              <p className="sp-up-desc">
                {current} includes {freeCap} pin
                {freeCap === 1 ? '' : 's'} per site per day.{' '}
                {resetsInMs != null
                  ? `Your limit resets in ${fmtUnlock(resetsInMs)}.`
                  : 'Your limit resets 24 hours after you use the last one.'}{' '}
                Existing pins stay editable.
              </p>
            </DialogDescription>

            <div className="sp-up-row">
              <span className="sp-up-label">Pick a plan</span>
              <div className="sp-up-seg" role="group" aria-label="Billing period">
                <button
                  type="button"
                  className="sp-up-seg-btn"
                  aria-pressed={cycle === 'monthly'}
                  onClick={() => setCycle('monthly')}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  className="sp-up-seg-btn"
                  aria-pressed={cycle === 'yearly'}
                  onClick={() => setCycle('yearly')}
                >
                  Yearly<span className="sp-up-save">2 mo free</span>
                </button>
              </div>
            </div>

            <div className="sp-up-plans" role="radiogroup" aria-label="Plan">
              {plans.map((id) => {
                const d = PLAN_DISPLAY[id]
                const active = plan === id
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    data-active={active}
                    className="sp-up-plan"
                    onClick={() => setPlan(id)}
                  >
                    <span className="sp-up-radio" aria-hidden="true" />
                    <span className="sp-up-plan-main">
                      <span className="sp-up-plan-name">
                        {d.name}
                        {id === 'pro' && (
                          <span className="sp-up-popular">Most popular</span>
                        )}
                      </span>
                      <span className="sp-up-plan-desc">{planBlurb(id)}</span>
                    </span>
                    <span className="sp-up-plan-price">
                      <span className="sp-up-price">
                        {cycle === 'yearly' ? d.yearlyPrice : d.monthlyPrice}
                      </span>
                      <span className="sp-up-period">
                        {cycle === 'yearly' ? 'per year' : 'per month'}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>

            {error && (
              <p className="sp-up-error" role="alert">
                {error}
              </p>
            )}

            <button
              type="button"
              className="sp-up-cta"
              disabled={busy}
              aria-busy={busy}
              onClick={() => void onContinue()}
            >
              {cta}
            </button>
            <button
              type="button"
              className="sp-up-later"
              onClick={() => onOpenChange(false)}
            >
              Not now
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

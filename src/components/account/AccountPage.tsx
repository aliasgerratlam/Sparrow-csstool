import { useEffect, useState } from 'react'
import { Check, Loader2, Settings, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { LandingHeader } from '@/components/landing/LandingHeader'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { Container, ArrowButton } from '@/components/landing/parts'
import { useAuth, userDisplayName, userPlan } from '@/context/auth-context'
import { useEntitlements } from '@/context/subscription-context'
import { isKelviqConfigured } from '@/lib/kelviq'
import { openPortal } from '@/lib/kelviq-checkout'
import { initials } from '@/lib/collab-identity'
import { cn } from '@/lib/format'
import footerGradient from '@/assets/footer-gradient.svg'

/* Account page (reached at /account, e.g. after a successful landing-page
   login). Wears the Sparrow landing look. Shows the signed-in identity, the
   subscription plan (Free vs. purchased), and a profile card of user details.
   Plan data comes from user_metadata via userPlan() — see auth-context. */

const LANDING_URL = '/'

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function AccountPage() {
  const { isAuthenticated, isConfigured, loading, openLoginDialog } = useAuth()

  // Landing here signed-out (e.g. deep link) prompts login rather than a blank.
  useEffect(() => {
    if (!loading && isConfigured && !isAuthenticated) openLoginDialog()
  }, [loading, isConfigured, isAuthenticated, openLoginDialog])

  return (
    <div className="min-h-screen bg-sparrow-cream font-abeezee text-sparrow-ink antialiased">
      {/* Same header as the marketing site (LandingHeader), which shows a
          Sign out action while on /account. */}
      <LandingHeader />

      {/* Clear the fixed header (logo pill sits ~96px tall at the top). */}
      <main className="pb-24 pt-28 md:pt-32">
        {loading ? (
          <Container>
            <p className="py-24 text-center text-sparrow-ink/50">Loading…</p>
          </Container>
        ) : isConfigured && !isAuthenticated ? (
          <SignedOut onSignIn={openLoginDialog} />
        ) : (
          <AccountBody />
        )}
      </main>

      {/* Footer over the shared blue gradient, matching the landing page. */}
      <div className="relative isolate">
        <img
          src={footerGradient}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 size-full object-cover object-bottom"
          style={{
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 220px)',
            maskImage: 'linear-gradient(to bottom, transparent 0, #000 220px)',
          }}
        />
        <LandingFooter />
      </div>
    </div>
  )
}

function SignedOut({ onSignIn }: { onSignIn: () => void }) {
  return (
    <Container>
      <div className="mx-auto mt-16 max-w-md rounded-[20px] bg-white p-10 text-center shadow-sm ring-1 ring-black/5">
        <h1 className="text-2xl font-semibold text-sparrow-navy">
          Sign in to view your account
        </h1>
        <p className="mt-2 text-sm text-sparrow-ink/60">
          Log in to see your subscription and profile details.
        </p>
        <ArrowButton variant="blue" onClick={onSignIn} className="mt-6">
          Sign in
        </ArrowButton>
      </div>
    </Container>
  )
}

function AccountBody() {
  const { user } = useAuth()
  const name = userDisplayName(user)
  const email = user?.email ?? ''

  return (
    <Container>
      {/* 1 — Identity: username + email up top. */}
      <section className="flex items-center gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-sparrow-blue text-xl font-bold text-white">
          {initials(name)}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold text-sparrow-navy md:text-3xl">
            {name}
          </h1>
          {email && email !== name && (
            <p className="truncate text-sm text-sparrow-ink/60 md:text-base">
              {email}
            </p>
          )}
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <SubscriptionCard />
        <ProfileCard />
      </div>
    </Container>
  )
}

function SubscriptionCard() {
  const { user, getToken, reloadUser } = useAuth()
  const { subscription, planId, refresh, isLoading } = useEntitlements()
  // Metadata plan is the display fallback (and the only source when Kelviq
  // isn't configured — live entitlements are unavailable then).
  const metaPlan = userPlan(user)

  // Show a successful-checkout toast on return from hosted checkout, then keep
  // pulling until the new plan appears. The kelviq-webhook (Kelviq → Supabase →
  // Clerk metadata) settles asynchronously, so a single immediate refresh races
  // it and lands stale ("Free"). Poll a few times with backoff, refreshing BOTH
  // the live Kelviq entitlements AND the Clerk user (the metadata fallback),
  // so the card flips on its own without a manual page reload.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('checkout') !== 'success') return
    url.searchParams.delete('checkout')
    window.history.replaceState(null, '', url.toString())
    toast.success('Payment successful — your plan is now active.')

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    // Escalating delays (~ms) covering the typical webhook settlement window.
    const schedule = [1500, 2500, 3000, 4000, 5000]
    let i = 0
    const tick = async () => {
      await Promise.allSettled([refresh(), reloadUser()])
      if (cancelled || i >= schedule.length) return
      timer = setTimeout(tick, schedule[i++])
    }
    timer = setTimeout(tick, schedule[i++])
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [refresh, reloadUser])

  const [busy, setBusy] = useState(false)

  const isPaid = subscription ? planId !== 'free' : metaPlan.isPaid
  const displayName = subscription
    ? planId.charAt(0).toUpperCase() + planId.slice(1)
    : metaPlan.name
  const billingCycle = subscription?.billingCycle ?? metaPlan.billingCycle
  const renews = fmtDate(subscription?.renewsAt ?? metaPlan.renewsAt)
  const endsAt = fmtDate(subscription?.endsAt)
  const status = subscription?.status ?? (isPaid ? 'active' : 'free')
  // A scheduled end date means the subscription is set to cancel at period end.
  const cancelling = !!subscription?.endsAt

  // Everything self-serve (cancel, resume, plan changes, invoices, payment
  // methods) happens in Kelviq's hosted customer portal — one door. Any change
  // made there flows back automatically: the account page reads LIVE Kelviq
  // entitlements (so it reflects on the next load) and the kelviq-webhook
  // mirrors the plan into Clerk metadata (which is what the extension gates on).
  const openCustomerPortal = async () => {
    if (busy) return
    setBusy(true)
    const r = await openPortal(getToken)
    if (r.status === 'redirecting') return // navigating away; keep spinner
    if (r.status === 'failed') toast.error(r.message || 'Could not open the portal.')
    setBusy(false)
  }

  // Management requires a live subscription + billing backend.
  const canManage = isKelviqConfigured && !!subscription

  // Entitlements resolve async (Kelviq fetch after mount). The interim value
  // fails closed to Free, which is right for feature gates but wrong to
  // *display* — it flashes "Free" at paying users. Hold a skeleton instead.
  if (isLoading) return <SubscriptionCardSkeleton />

  return (
    <section className="flex min-w-0 flex-col rounded-[20px] bg-white p-8 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-sparrow-ink">Subscription</h2>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold capitalize',
            cancelling
              ? 'bg-amber-500/10 text-amber-600'
              : isPaid
                ? 'bg-sparrow-blue/10 text-sparrow-blue'
                : 'bg-black/5 text-sparrow-ink/70',
          )}
        >
          {cancelling ? (
            'Cancels soon'
          ) : isPaid ? (
            <>
              <Check className="size-3.5" /> {status}
            </>
          ) : (
            'Free plan'
          )}
        </span>
      </div>

      <div className="mt-6 flex items-end gap-2">
        <span className="text-4xl font-semibold text-sparrow-ink">
          {displayName}
        </span>
      </div>

      {isPaid ? (
        <dl className="mt-6 space-y-3 text-sm">
          {billingCycle && (
            <Row label="Billing cycle">
              <span className="capitalize">{billingCycle}</span>
            </Row>
          )}
          <Row label="Status">
            <span className="capitalize">{status}</span>
          </Row>
          {cancelling && endsAt ? (
            <Row label="Access until">{endsAt}</Row>
          ) : (
            renews && <Row label="Renews on">{renews}</Row>
          )}
        </dl>
      ) : (
        <p className="mt-4 flex-1 text-sm text-sparrow-ink/60">
          You're on the Free plan. Upgrade to unlock the CSS color-format
          toggle, Color &amp; Font modes, the assets downloader, and more
          annotations.
        </p>
      )}

      {/* Upgrade / downgrade always routes to the pricing cards. */}
      <ArrowButton
        variant={isPaid ? 'dark' : 'blue'}
        href={`${LANDING_URL}#pricing`}
        className="mt-8 w-full"
      >
        {isPaid ? 'Change plan' : 'Upgrade plan'}
        {!isPaid && <Sparkles className="ml-0.5 size-4" />}
      </ArrowButton>

      {canManage && (
        <ManageButton
          className="mt-5 w-full cursor-pointer"
          onClick={() => void openCustomerPortal()}
          busy={busy}
          icon={<Settings className="size-4" />}
        >
          Manage subscription
        </ManageButton>
      )}
    </section>
  )
}

/* Mirrors the loaded card's layout (header row, big plan name, detail rows,
   full-width action) so nothing jumps when real data lands. */
function SubscriptionCardSkeleton() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading subscription"
      className="flex min-w-0 flex-col rounded-[20px] bg-white p-8 shadow-sm ring-1 ring-black/5"
    >
      <div className="flex animate-pulse items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-sparrow-ink">Subscription</h2>
        <span className="h-6 w-24 rounded-full bg-black/5" />
      </div>
      <div className="mt-6 animate-pulse">
        <div className="h-10 w-32 rounded-lg bg-black/10" />
        <div className="mt-6 space-y-3">
          <div className="h-4 w-full rounded bg-black/5" />
          <div className="h-4 w-3/4 rounded bg-black/5" />
          <div className="h-4 w-2/3 rounded bg-black/5" />
        </div>
        <div className="mt-8 h-12 w-full rounded-[10px] bg-black/10" />
      </div>
    </section>
  )
}

function ManageButton({
  children,
  onClick,
  busy,
  icon,
  className,
}: {
  children: React.ReactNode
  onClick: () => void
  busy: boolean
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-[10px] px-4 py-2.5 text-sm font-semibold text-sparrow-ink ring-1 ring-inset ring-black/10 transition-colors hover:bg-black/5 disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

function ProfileCard() {
  const { user } = useAuth()
  const provider = user?.provider ?? 'email'
  const created = fmtDate(user?.createdAt)
  const lastSignIn = fmtDate(user?.lastSignInAt)

  return (
    <section className="flex min-w-0 flex-col rounded-[20px] bg-white p-8 shadow-sm ring-1 ring-black/5">
      <h2 className="text-lg font-semibold text-sparrow-ink">Profile</h2>
      <dl className="mt-6 space-y-3 text-sm">
        <Row label="Full name">{userDisplayName(user)}</Row>
        <Row label="Email">{user?.email ?? '—'}</Row>
        <Row label="Email verified">
          {user?.emailVerified ? 'Yes' : 'No'}
        </Row>
        <Row label="Sign-in method">
          <span className="capitalize">{provider}</span>
        </Row>
        {created && <Row label="Member since">{created}</Row>}
        {lastSignIn && <Row label="Last sign in">{lastSignIn}</Row>}
        <Row label="User ID">
          <span className="break-all font-mono text-xs text-sparrow-ink/60">
            {user?.id ?? '—'}
          </span>
        </Row>
      </dl>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-black/5 pb-3 last:border-0 last:pb-0">
      <dt className="shrink-0 text-sparrow-ink/50">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-sparrow-ink [overflow-wrap:anywhere]">
        {children}
      </dd>
    </div>
  )
}

import { memo, useEffect, useRef, useState } from 'react'
import { useAuth, userDisplayName, userPlan } from '@/context/auth-context'
import { useAppNavigate } from '@/context/navigation-context'
import {
  GATING_ACTIVE,
  goToPricing,
  useEntitlements,
} from '@/context/subscription-context'
import { store, useAnnotationQuota } from '@/hooks/use-annotations'
import { PLAN_DISPLAY, shareExpiryLabel } from '@/lib/plans'
import { initials } from '@/lib/collab-identity'

/* Signed-in session-pill account button + popover (Account board of the Sparrow
   extension UI redesign). The avatar wears a ring showing today's pins used on
   this site (real server quota — omitted when the cap isn't enforced). The
   popover opens upward and holds the profile, a plan card (pins used, share-link
   lifetime, upgrade CTA) and the Account portal / Contact support / Sign out
   items. Lightweight (local state + click-outside); the repo has no dropdown
   primitive. It sits inside #scanner-toolbar, which is already whitelisted in
   ScannerController's isScannerUI, so clicks are safe. Styles: sparrow-ui/account.css. */

const CONTACT_EMAIL = 'hello@trysparrowcss.com'
const RING_R = 17
const RING_C = 2 * Math.PI * RING_R

const ICON = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const UserMenu = memo(function UserMenu() {
  const { user, signOut } = useAuth()
  const appNavigate = useAppNavigate()
  const { planId, subscription, shareExpiryMs } = useEntitlements()
  const quota = useAnnotationQuota()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const name = userDisplayName(user)
  const email = user?.email ?? ''

  // Pull the authoritative per-site count once so the ring / "x / y" never show
  // a not-yet-loaded 0. No-op when the quota backend is inactive.
  const [quotaReady, setQuotaReady] = useState(false)
  useEffect(() => {
    let live = true
    void store.refreshQuota().then(() => live && setQuotaReady(true))
    return () => {
      live = false
    }
  }, [user?.id])

  const capped = GATING_ACTIVE && Number.isFinite(quota.limit) && quota.limit > 0
  const showRing = capped && (quotaReady || quota.used > 0)
  const used = Math.min(quota.used, quota.limit)
  const frac = capped ? Math.min(1, quota.used / quota.limit) : 0

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      // In the extension the menu lives in a Shadow DOM, so a document-level
      // event's `target` retargets to the shadow host — `contains(e.target)`
      // would then read every in-menu click as "outside" and close the popover
      // on mousedown, before the Account/Logout click can land. composedPath()
      // crosses the shadow boundary and lists the real clicked node.
      const root = rootRef.current
      if (root && !e.composedPath().includes(root)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // While the popover is open it OWNS Escape (capture + stop), otherwise
      // ScannerController's handler would tear the whole scanner down with it.
      e.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', onDocClick, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDocClick, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  // Menu keyboard model: focus the first item on open; arrows / Home / End roam.
  useEffect(() => {
    if (!open) return
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [open])

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    const items = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    )
    if (!items.length) return
    e.preventDefault()
    const i = items.indexOf(e.target as HTMLElement)
    let next = i
    if (e.key === 'ArrowDown') next = (i + 1) % items.length
    else if (e.key === 'ArrowUp') next = (i - 1 + items.length) % items.length
    else if (e.key === 'Home') next = 0
    else next = items.length - 1
    items[next]?.focus()
  }

  const pinsLabel = showRing ? `${used} of ${quota.limit} pins used today` : ''

  // Plan card ---------------------------------------------------------------
  const planName = PLAN_DISPLAY[planId].name
  const metaRenewsAt = userPlan(user).renewsAt
  const planNote =
    planId === 'free'
      ? 'never expires'
      : fmtDate(subscription?.endsAt)
        ? `ends ${fmtDate(subscription?.endsAt)}`
        : fmtDate(subscription?.renewsAt ?? metaRenewsAt)
          ? `renews ${fmtDate(subscription?.renewsAt ?? metaRenewsAt)}`
          : null
  const upgradeTo = planId === 'free' ? 'pro' : planId === 'pro' ? 'max' : null
  const segments = capped ? Math.min(quota.limit, 12) : 0

  return (
    <div className="auth-user-menu sp-acct" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="auth-user-chip sp-acct-chip"
        title={showRing ? `${used} of ${quota.limit} pins today` : email || name}
        aria-label={pinsLabel ? `Account — ${pinsLabel}` : 'Account'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {showRing && (
          <svg
            className="sp-acct-ring"
            width="38"
            height="38"
            viewBox="0 0 38 38"
            aria-hidden="true"
          >
            <circle className="sp-acct-ring-track" cx="19" cy="19" r={RING_R} fill="none" strokeWidth="2.5" />
            <circle
              className="sp-acct-ring-fill"
              cx="19"
              cy="19"
              r={RING_R}
              fill="none"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={`${(frac * RING_C).toFixed(1)} ${RING_C.toFixed(1)}`}
            />
          </svg>
        )}
        <span className="auth-user-avatar sp-acct-avatar">{initials(name)}</span>
      </button>

      {open && (
        <div
          className="auth-user-pop sp-acct-pop"
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKeyDown}
        >
          <div className="sp-acct-head">
            <span className="sp-acct-avatar sp-acct-avatar-lg" aria-hidden="true">
              {initials(name)}
            </span>
            <div className="sp-acct-who">
              <div className="auth-user-name sp-acct-name">{name}</div>
              {email && email !== name && (
                <div className="auth-user-email sp-acct-email">{email}</div>
              )}
            </div>
          </div>

          {GATING_ACTIVE && (
            <div className="sp-acct-plan">
              <div className="sp-acct-plan-top">
                <span className="sp-acct-plan-chip">{planName} plan</span>
                {planNote && <span className="sp-acct-plan-note">{planNote}</span>}
              </div>

              <div className="sp-acct-row sp-acct-row-pins">
                <span>Pins on this site today</span>
                <span className="sp-acct-val">
                  {capped
                    ? quotaReady || quota.used > 0
                      ? `${used} / ${quota.limit}`
                      : `- / ${quota.limit}`
                    : 'Unlimited'}
                </span>
              </div>
              {capped && (
                <div className="sp-acct-meter" aria-hidden="true">
                  {Array.from({ length: segments }, (_, i) => (
                    <span
                      key={i}
                      className={
                        'sp-acct-seg' +
                        (i < Math.round((quota.used / quota.limit) * segments) ? ' on' : '')
                      }
                    />
                  ))}
                </div>
              )}

              <div className="sp-acct-row sp-acct-row-share">
                <span>Share links last</span>
                <span className="sp-acct-val">{capitalize(shareExpiryLabel(shareExpiryMs))}</span>
              </div>

              {upgradeTo && (
                <button
                  type="button"
                  className="sp-acct-upgrade"
                  onClick={() => {
                    setOpen(false)
                    goToPricing()
                  }}
                >
                  Go {PLAN_DISPLAY[upgradeTo].name} — {PLAN_DISPLAY[upgradeTo].monthlyPrice}/month
                </button>
              )}
            </div>
          )}

          <div className="sp-acct-list">
            <a
              className="auth-user-logout sp-acct-item"
              role="menuitem"
              href="/account"
              onClick={(e) => {
                // Client-side on the web (no reload); the extension has no router,
                // so useAppNavigate falls back to a full navigation there.
                if (
                  e.button !== 0 ||
                  e.metaKey ||
                  e.ctrlKey ||
                  e.shiftKey ||
                  e.altKey
                )
                  return
                e.preventDefault()
                setOpen(false)
                appNavigate('/account')
              }}
            >
              <svg {...ICON} className="sp-acct-ico">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <path d="M2 10h20" />
              </svg>
              Account portal
              <svg {...ICON} width={14} height={14} className="sp-acct-ext">
                <path d="M7 17L17 7M8 7h9v9" />
              </svg>
            </a>
            <a
              className="auth-user-logout sp-acct-item"
              role="menuitem"
              href={`mailto:${CONTACT_EMAIL}`}
              onClick={() => setOpen(false)}
            >
              <svg {...ICON} className="sp-acct-ico">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3 7l9 6 9-6" />
              </svg>
              Contact support
            </a>
            <div className="sp-acct-sep" aria-hidden="true" />
            <button
              type="button"
              className="auth-user-logout sp-acct-item sp-acct-danger"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                void signOut()
              }}
            >
              <svg {...ICON} className="sp-acct-ico">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M16 17l5-5-5-5M21 12H9" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
})

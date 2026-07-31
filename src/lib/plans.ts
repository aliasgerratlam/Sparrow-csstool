/* ─────────────────────────────────────────────────────────────────────────
   Shared plan / feature model — the single canonical source for:
     - the three subscription tiers (Free / Pro / Max),
     - the Kelviq feature identifiers used for gating,
     - the per-tier limits (used as the Free fallback in-app, and as the sole
       resolution source in the browser extension), and
     - display copy for the pricing cards.

   Framework-agnostic (no React), so both the web app and the extension import
   it. Kelviq's dashboard is the source of truth for PRICES; the price strings
   here are cosmetic labels only (see PLAN_DISPLAY). The FEATURE_IDS and plan
   identifiers MUST match what's configured in the Kelviq dashboard.

   Annotation limit semantics: the cap is PER-DOMAIN and resets every 24h,
   enforced client-side (see lib/annotation-quota.ts). Kelviq only delivers the
   cap number via the `annotations-limit` customizable entitlement; `Infinity`
   means unlimited (Max).

   Share-link expiry semantics: a link's lifetime is stamped ONCE at creation
   from the caller's server-verified plan and is never recomputed or extended —
   an upgrade/downgrade doesn't move an existing link's expiry. Unlike the
   annotation cap this is NOT a Kelviq entitlement: the duration derives from the
   plan id alone (no dashboard config). `Infinity` means "never expires", which
   on the wire and in the DB is `null` (never JSON-serialize Infinity — it
   becomes null anyway, so the two representations are deliberately distinct).
   The ceiling is enforced in Postgres (see the enforce_session_expiry trigger in
   supabase/schema.sql), which caps any browser/anon insert at the Free duration;
   the session-create Edge Function is what ELEVATES a link to 30d/never.
───────────────────────────────────────────────────────────────────────── */

export type PlanId = 'free' | 'pro' | 'max'

/** Kelviq plan identifiers — must match `planIdentifier` in the dashboard. */
export const PLAN_IDS: PlanId[] = ['free', 'pro', 'max']

/** Kelviq feature identifiers — must match `featureId` in the dashboard. */
export const FEATURE_IDS = {
  /** Boolean — unlock the CSS color-format (HEX/RGBA/HSL) toggle. */
  colorFormat: 'css-color-format',
  /** Boolean — unlock the site/element Color Change mode. */
  colorMode: 'color-mode',
  /** Boolean — unlock the site/element Font mode. */
  fontMode: 'font-mode',
  /** Boolean — unlock the Assets downloader. */
  assets: 'assets-download',
  /** Customizable numeric — per-domain/24h annotation cap. */
  annotationsLimit: 'annotations-limit',
} as const

/** The resolved capability set every gate consumes (see useEntitlements). */
export interface PlanLimits {
  colorFormat: boolean
  colorMode: boolean
  fontMode: boolean
  assets: boolean
  /** Per-domain annotations allowed per 24h. Infinity = unlimited. */
  annotationLimit: number
  /** Share-link lifetime in ms, stamped at creation. Infinity = never expires. */
  shareExpiryMs: number
}

/** Share-link lifetimes, named so the numbers read at every use site. */
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** Per-tier limits. Free = the fallback when Kelviq is unconfigured/loading;
    also the extension's sole resolution source (keyed by plan id). */
export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    colorFormat: false,
    colorMode: false,
    fontMode: false,
    assets: false,
    annotationLimit: 3,
    shareExpiryMs: 24 * HOUR_MS,
  },
  pro: {
    colorFormat: true,
    colorMode: true,
    fontMode: true,
    assets: true,
    annotationLimit: 10,
    shareExpiryMs: 30 * DAY_MS,
  },
  max: {
    colorFormat: true,
    colorMode: true,
    fontMode: true,
    assets: true,
    annotationLimit: Infinity,
    shareExpiryMs: Infinity,
  },
}

/** Human label for a share-link lifetime — "24 hours" / "30 days" / "never".
    A day or less reads in hours (Free's cap is "24 hours", not "1 day" — that's
    how the pricing cards and the share dialog word it). */
export function shareExpiryLabel(ms: number): string {
  if (!Number.isFinite(ms)) return 'never'
  if (ms <= DAY_MS) {
    const hours = Math.max(1, Math.round(ms / HOUR_MS))
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }
  const days = Math.max(1, Math.round(ms / DAY_MS))
  return `${days} day${days === 1 ? '' : 's'}`
}

/** Display copy for the pricing cards + account page. Prices are placeholders
    (Kelviq is the real source); update freely without touching gating logic. */
export interface PlanDisplay {
  id: PlanId
  name: string
  tagline: string
  monthlyPrice: string
  yearlyPrice: string
  features: string[]
  cta: string
  ctaVariant: 'blue' | 'dark'
  highlight?: boolean
}

export const PLAN_DISPLAY: Record<PlanId, PlanDisplay> = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: 'Everything you need to start inspecting.',
    monthlyPrice: '$0',
    yearlyPrice: '$0',
    features: [
      'Full CSS inspector with cascade view',
      'Ruler with alignment guides',
      '3 annotations per site per day',
      'Share links last 24 hours',
      'Website color overview',
    ],
    cta: 'Start for free',
    ctaVariant: 'blue',
    highlight: true,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'The complete toolkit for daily design work.',
    monthlyPrice: '$9',
    yearlyPrice: '$90',
    features: [
      'Everything in Free',
      '10 annotations per site per day',
      '30-day share links',
      'Multiple color format toggle',
      'Site-wide color swapping',
      'Font testing Google Fonts + your own uploads',
      'Asset downloads, single or ZIP',
      'Multiple color formats support',
      'Priority support',
    ],
    cta: 'Go Pro',
    ctaVariant: 'blue',
  },
  max: {
    id: 'max',
    name: 'Max',
    tagline: 'No limits, for teams that review every day.',
    monthlyPrice: '$19',
    yearlyPrice: '$190',
    features: [
      'Everything in Pro',
      'Unlimited annotations',
      'Share links that never expire',
      'Priority support',
    ],
    cta: 'Go Max',
    ctaVariant: 'dark',
  },
}

/** Narrow an arbitrary string (e.g. Clerk metadata) to a known PlanId. */
export function toPlanId(raw: unknown): PlanId {
  const v = String(raw ?? 'free').toLowerCase()
  return v === 'pro' || v === 'max' ? v : 'free'
}

/** Limits for a plan id (Free when unknown). */
export function limitsForPlan(id: PlanId): PlanLimits {
  return PLAN_LIMITS[id] ?? PLAN_LIMITS.free
}

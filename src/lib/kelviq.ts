/* ─────────────────────────────────────────────────────────────────────────
   Kelviq config. Mirrors the env-gated, null-safe shape of clerk.ts /
   supabase.ts: read the client (publishable) key + product id from
   import.meta.env, expose an `isKelviqConfigured` flag, and no-op cleanly when
   unconfigured — the app then behaves as a pure Free tier with nothing gated
   beyond the built-in Free limits.

   Kelviq is a Merchant-of-Record billing platform (hosted checkout, customer
   portal, tax, 135+ currencies). We use three surfaces:
     - React SDK  — live entitlements in the web app (feature gating).
     - Node SDK   — Supabase Edge Functions (checkout / subscription / portal).
     - Webhooks   — an Edge Function mirrors plan state into Clerk metadata.

   The CLIENT key is safe in the browser. The SERVER key and the webhook
   signing secret are Supabase function secrets and must NEVER be VITE_ vars.

   Checkout / upgrade / portal go through the Edge Functions, so — like the
   old Razorpay path — they need BOTH a Kelviq client key AND a configured
   Supabase client (to invoke the functions). Entitlement reads only need the
   client key + product id.
───────────────────────────────────────────────────────────────────────── */

import { isCollabEnabled } from './supabase'

export const KELVIQ_CLIENT_KEY = import.meta.env.VITE_KELVIQ_CLIENT_KEY
export const KELVIQ_PRODUCT_ID = import.meta.env.VITE_KELVIQ_PRODUCT_ID

/** The SDK's environment value (it derives the API base URL from this).
    VITE_KELVIQ_ENV accepts 'live' (→ 'production') or 'sandbox' (default). */
export const KELVIQ_ENVIRONMENT: 'sandbox' | 'production' =
  import.meta.env.VITE_KELVIQ_ENV === 'live' ? 'production' : 'sandbox'

/** True when a Kelviq client key + product id are present AND the Edge
    Functions are reachable (they run through Supabase). When false the
    subscription context falls back to the Free tier and nothing is gated. */
export const isKelviqConfigured: boolean =
  !!KELVIQ_CLIENT_KEY && !!KELVIQ_PRODUCT_ID && isCollabEnabled

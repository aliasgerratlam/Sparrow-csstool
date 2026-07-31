/* ─────────────────────────────────────────────────────────────────────────
   Server-side per-tier limits for the annotation-quota and session-create Edge
   Functions.

   Deno can't import the Vite app's `@/lib/plans` module, so these numbers are
   duplicated here. ⚠️ KEEP IN SYNC with `src/lib/plans.ts` (PLAN_LIMITS[*].
   annotationLimit / shareExpiryMs) AND the extension — a mismatch would enforce
   something different on the server than the UI shows. `null` = unlimited /
   never (the app's Infinity, which must never be JSON-serialized: it silently
   becomes null anyway). `src/lib/plans.test.ts` asserts both maps agree.

   This is Deno (Supabase Edge Functions), not the Vite/React app — it never
   goes through `tsc -b`.
───────────────────────────────────────────────────────────────────────── */

export const ANNOTATION_CAP: Record<'free' | 'pro' | 'max', number | null> = {
  free: 3,
  pro: 10,
  max: null, // null = unlimited
}

/** Share-link lifetime in ms, stamped once at creation. null = never expires. */
export const SHARE_EXPIRY_MS: Record<'free' | 'pro' | 'max', number | null> = {
  free: 24 * 60 * 60 * 1000,
  pro: 30 * 24 * 60 * 60 * 1000,
  max: null, // null = never expires
}

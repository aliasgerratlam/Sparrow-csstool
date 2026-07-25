/* ─────────────────────────────────────────────────────────────────────────
   Server-side per-tier annotation caps for the annotation-quota Edge Function.

   Deno can't import the Vite app's `@/lib/plans` module, so the cap numbers are
   duplicated here. ⚠️ KEEP IN SYNC with `src/lib/plans.ts` (PLAN_LIMITS[*].
   annotationLimit) AND the extension — a mismatch would enforce a different cap
   on the server than the UI shows. `null` = unlimited (the app's Infinity).

   This is Deno (Supabase Edge Functions), not the Vite/React app — it never
   goes through `tsc -b`.
───────────────────────────────────────────────────────────────────────── */

export const ANNOTATION_CAP: Record<'free' | 'pro' | 'max', number | null> = {
  free: 3,
  pro: 10,
  max: null, // null = unlimited
}

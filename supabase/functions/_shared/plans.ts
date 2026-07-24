/* ─────────────────────────────────────────────────────────────────────────
   Per-tier annotation caps — server-side copy of the numbers the browser reads
   from src/lib/plans.ts (`PLAN_LIMITS[*].annotationLimit`).

   ⚠️ SYNC NOTE: these MUST match the web app's PLAN_LIMITS caps. This is a
   deliberate, minimal duplication (Deno can't import the Vite `@/` app module),
   kept tiny so drift is obvious. If you change a cap here, change it there too —
   and in the extension (see memory `kelviq-subscriptions` /
   `sync-tool-changes-to-extension`). `null` = unlimited (Max).

   Deno (Supabase Edge Function) — never goes through the app's `tsc -b`.
───────────────────────────────────────────────────────────────────────── */

export const ANNOTATION_CAP: Record<'free' | 'pro' | 'max', number | null> = {
  free: 3,
  pro: 10,
  max: null,
}

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/* ─────────────────────────────────────────────────────────────────────────
   Supabase client singleton. Lives behind an env check: when the project
   isn't configured (no VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY), `supabase`
   is null and every collab code path no-ops, so the app behaves exactly as it
   did before (localStorage-only annotations, no presence/cursors).
───────────────────────────────────────────────────────────────────────── */

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        realtime: { params: { eventsPerSecond: 20 } },
      })
    : null

/* The raw credentials, for the one caller that can't go through supabase-js: a
   write issued from `beforeunload` needs `fetch(..., { keepalive: true })` to
   outlive the document, and supabase-js has no per-request fetch options.
   Empty strings when unconfigured (guard with `isCollabEnabled`). */
export const SUPABASE_URL = (url ?? '').replace(/\/+$/, '')
export const SUPABASE_ANON_KEY = anonKey ?? ''

/** True when Supabase credentials are present and realtime collab is live. */
export const isCollabEnabled = supabase != null

/** Table holding shared annotations (see supabase/schema.sql). */
export const ANNOTATIONS_TABLE = 'annotations'

/** Table holding live collaboration sessions (see supabase/schema.sql). */
export const SESSIONS_TABLE = 'sessions'

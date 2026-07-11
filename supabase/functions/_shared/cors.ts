/* ─────────────────────────────────────────────────────────────────────────
   Shared CORS handling for the Kelviq Edge Functions.

   These functions are called from the browser (the SPA) with a custom
   `x-clerk-token` header, so the browser sends a preflight OPTIONS request.
   Every response — including errors — must carry these headers or the browser
   drops the response before the app can read it.

   This is Deno (Supabase Edge Functions), not the Vite/React app — it never
   goes through `tsc -b` (tsconfig only includes `src`).
───────────────────────────────────────────────────────────────────────── */

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-clerk-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Answer a CORS preflight; returns null for non-OPTIONS requests. */
export function handlePreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  return null
}

/** JSON response with CORS headers attached. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

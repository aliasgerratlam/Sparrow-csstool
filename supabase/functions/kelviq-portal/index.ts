/* ─────────────────────────────────────────────────────────────────────────
   kelviq-portal — mint a Kelviq customer-portal session for the caller and
   return its URL. The hosted portal lets users manage payment methods, view
   invoices / payment history, and manage their subscription self-serve.

   Deno (Supabase Edge Function). verify_jwt = false (we do our own auth).
───────────────────────────────────────────────────────────────────────── */

import { handlePreflight, json } from '../_shared/cors.ts'
import { requireUser } from '../_shared/clerk.ts'
import { kelviqClient } from '../_shared/kelviq.ts'

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const user = await requireUser(req)
  if (!user) return json({ error: 'Unauthorized' }, 401)

  try {
    const kelviq = kelviqClient()
    const session = await kelviq.portal.createSession({ customerId: user.userId })
    return json({ portalUrl: session.customerPortalUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not open portal'
    return json({ error: message }, 502)
  }
})

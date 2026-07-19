/* ─────────────────────────────────────────────────────────────────────────
   kelviq-checkout — create a hosted checkout session for a NEW subscription.

   Flow: verify the Clerk caller → ensure a Kelviq customer exists for them
   (customerId = Clerk user id) → create a checkout session → return its URL.
   The browser redirects to the returned checkoutUrl (Kelviq-hosted; handles
   domestic/international cards, wallets, local methods, and tax as MoR).

   Deno (Supabase Edge Function). Registered with verify_jwt = false so the
   gateway doesn't 401 the CORS preflight — we do our own auth.
───────────────────────────────────────────────────────────────────────── */

import { handlePreflight, json } from '../_shared/cors.ts'
import { authenticateUser } from '../_shared/clerk.ts'
import { kelviqClient } from '../_shared/kelviq.ts'

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticateUser(req)
  if (!auth.ok) {
    console.error('[kelviq-checkout] auth failed:', auth.reason)
    return json({ error: 'Unauthorized', reason: auth.reason }, 401)
  }
  const user = auth.user

  let body: {
    planIdentifier?: string
    chargePeriod?: string
    successUrl?: string
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const { planIdentifier, chargePeriod, successUrl } = body
  if (!planIdentifier || !chargePeriod || !successUrl) {
    return json({ error: 'Missing planIdentifier / chargePeriod / successUrl' }, 400)
  }

  try {
    const kelviq = kelviqClient()

    // Ensure the customer exists (idempotent — ignore "already exists").
    try {
      await kelviq.customers.create({
        customerId: user.userId,
        email: user.email || undefined,
        name: user.name || undefined,
      })
    } catch (_) {
      /* already registered — fine. */
    }

    const session = await kelviq.checkout.createSession({
      planIdentifier,
      // deno-lint-ignore no-explicit-any
      chargePeriod: chargePeriod as any,
      customerId: user.userId,
      successUrl,
    })
    return json({ checkoutUrl: session.checkoutUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout failed'
    return json({ error: message }, 502)
  }
})

/* ─────────────────────────────────────────────────────────────────────────
   Shared Clerk helpers for the Kelviq Edge Functions (Deno).

   The mutating functions (checkout / subscription / portal) authenticate the
   caller with their Clerk session token (x-clerk-token). The webhook is not
   caller-authenticated (Kelviq signs it) but it writes plan state back into
   Clerk publicMetadata via the same secret-key client — that metadata is what
   userPlan() reads in the app and what the browser extension gates on.

   This is Deno, not the Vite/React app — it never goes through `tsc -b`.
───────────────────────────────────────────────────────────────────────── */

import { verifyToken, createClerkClient } from 'npm:@clerk/backend@1'

const CLERK_SECRET_KEY = Deno.env.get('CLERK_SECRET_KEY') ?? ''

export interface CallerUser {
  userId: string
  email: string
  name: string
}

/** Verify the x-clerk-token and resolve the caller, or null if unauthenticated. */
export async function requireUser(req: Request): Promise<CallerUser | null> {
  const token = req.headers.get('x-clerk-token')
  if (!token || !CLERK_SECRET_KEY) return null
  try {
    const claims = await verifyToken(token, { secretKey: CLERK_SECRET_KEY })
    const userId = String(claims.sub)
    if (!userId) return null
    const clerk = createClerkClient({ secretKey: CLERK_SECRET_KEY })
    const user = await clerk.users.getUser(userId)
    const email =
      user.primaryEmailAddress?.emailAddress ??
      user.emailAddresses?.[0]?.emailAddress ??
      ''
    const name = user.fullName || user.firstName || user.username || ''
    return { userId, email, name }
  } catch {
    return null
  }
}

/** Mirror a subscription's plan state into the user's Clerk publicMetadata. */
export async function updateClerkPlan(
  userId: string,
  fields: {
    plan: string
    billingCycle: string | null
    renewsAt: string | null
    status: string | null
  },
): Promise<void> {
  if (!CLERK_SECRET_KEY) return
  const clerk = createClerkClient({ secretKey: CLERK_SECRET_KEY })
  await clerk.users.updateUserMetadata(userId, {
    publicMetadata: {
      plan: fields.plan,
      billing_cycle: fields.billingCycle,
      plan_renews_at: fields.renewsAt,
      subscription_status: fields.status,
    },
  })
}

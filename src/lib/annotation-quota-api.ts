/* ─────────────────────────────────────────────────────────────────────────
   Annotation quota — client helper for the server-authoritative count.

   The cap NUMBER still comes from the subscription entitlement, but the COUNT
   and the reset clock now live on the backend (the `annotation-quota` Edge
   Function), keyed to the verified Clerk identity — so the cap survives a
   localStorage clear / incognito and can't be reset from devtools. There is no
   longer any localStorage ledger. Enforcement is STRICT: when the user is signed
   in and gating is on but the credit can't be confirmed (no token / backend
   unreachable), the store fails CLOSED (blocks the annotation) so the cap can't
   be bypassed by blocking the check.

   Mirrors the invoke / edgeErrorMessage pattern from kelviq-checkout.ts.

     fetchQuotaStatus  → action:'status'  (read the current count)
     reserveAnnotation → action:'reserve' (server records the slot on allow)

   Gated on `isQuotaBackendActive` = isCollabEnabled (Supabase reachable). NOT on
   the Kelviq CLIENT key: the cap is resolved server-side via the Kelviq SERVER
   key, and the extension never ships the client SDK.
───────────────────────────────────────────────────────────────────────── */

import { supabase, isCollabEnabled } from './supabase'

/** Whether the server quota can be used at all (Supabase configured). */
export const isQuotaBackendActive = isCollabEnabled

export type GetToken = () => Promise<string | null>

/** Quota snapshot as the app consumes it — `limit` uses Infinity for unlimited. */
export interface QuotaStatus {
  used: number
  limit: number
  resetsInMs: number | null
}

/** A reserve outcome: the status after the attempt + whether it was allowed. */
export interface ReserveResult extends QuotaStatus {
  allowed: boolean
}

const FUNCTION = 'annotation-quota'

/** Server sends `null` for unlimited; the app uses one numeric type (Infinity). */
function normLimit(v: unknown): number {
  return v === null || v === undefined ? Infinity : Number(v)
}

function normResets(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** supabase-js surfaces a non-2xx Edge response as a FunctionsHttpError whose
    `.message` is generic; the actionable `{ error, reason }` is in the response
    body reachable via `error.context`. Pull it out (same as kelviq-checkout). */
async function edgeErrorMessage(error: unknown): Promise<string> {
  const ctx = (error as { context?: unknown })?.context
  if (ctx instanceof Response) {
    try {
      const body = await ctx.clone().json()
      const reason = typeof body?.reason === 'string' ? body.reason : ''
      const msg = typeof body?.error === 'string' ? body.error : ''
      const combined = [msg, reason].filter(Boolean).join(': ')
      if (combined) return combined
    } catch {
      /* body wasn't JSON — fall through. */
    }
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const m = (error as { message?: unknown }).message
    if (typeof m === 'string' && m) return m
  }
  return 'Quota request failed'
}

/** Ask for the Clerk token, retrying briefly. Right after sign-in the session
    can settle a beat after auth reports signed-in, so a single getToken() may
    resolve null for a signed-in user. Retry a few times (short backoff) so that
    race reliably yields the token and the user is enforced — rather than falling
    open. Returns null only when there's genuinely no token (signed out, or an
    environment that can't mint one, e.g. the Firefox extension). */
async function resolveToken(getToken: GetToken): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = await getToken()
    if (token) return token
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
  }
  return null
}

/** Invoke the quota function with the Clerk token attached. Throws when the
    backend isn't configured, no token is available, or the call errors — callers
    decide the fallback. */
async function invoke(
  body: { action: 'status' | 'reserve'; domain: string },
  getToken: GetToken,
): Promise<Record<string, unknown>> {
  if (!isQuotaBackendActive || !supabase) {
    throw new Error('Quota backend is not configured')
  }
  // getToken() can resolve null even while auth reports signed-in (Clerk session
  // not ready yet; on the extension, Firefox / a Sync Host miss). Without the
  // token the function can only ever 401 ("Missing x-clerk-token header"), so
  // skip the round-trip and let callers fail open — same net behaviour, no
  // pointless request or console noise.
  const token = await resolveToken(getToken)
  if (!token) throw new Error('No Clerk session token available')
  const { data, error } = await supabase.functions.invoke(FUNCTION, {
    headers: { 'x-clerk-token': token },
    body,
  })
  if (error) throw new Error(await edgeErrorMessage(error))
  return (data ?? {}) as Record<string, unknown>
}

/** Read the current server-side quota for a domain. */
export async function fetchQuotaStatus(
  domain: string,
  getToken: GetToken,
): Promise<QuotaStatus> {
  const data = await invoke({ action: 'status', domain }, getToken)
  return {
    used: Number(data.used ?? 0),
    limit: normLimit(data.limit),
    resetsInMs: normResets(data.resetsInMs),
  }
}

/** Reserve one slot server-side. On `allowed:true` the server already recorded
    the event; on `false` nothing was written and the cap is reached. */
export async function reserveAnnotation(
  domain: string,
  getToken: GetToken,
): Promise<ReserveResult> {
  const data = await invoke({ action: 'reserve', domain }, getToken)
  return {
    allowed: !!data.allowed,
    used: Number(data.used ?? 0),
    limit: normLimit(data.limit),
    resetsInMs: normResets(data.resetsInMs),
  }
}

/** The domain the cap is scoped to (the hostname the annotation is left on). */
export function currentDomain(): string {
  try {
    return window.location.hostname || 'localhost'
  } catch {
    return 'localhost'
  }
}

/** Human "resets in …" label — minutes under an hour, rounded-up hours above.
    (Moved here from the removed localStorage ledger; purely presentational.) */
export function formatReset(ms: number): string {
  const mins = Math.max(1, Math.ceil(ms / 60_000))
  if (mins < 60) return `${mins}m`
  return `${Math.ceil(ms / 3_600_000)}h`
}

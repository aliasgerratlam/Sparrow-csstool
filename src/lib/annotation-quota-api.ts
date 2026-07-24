/* ─────────────────────────────────────────────────────────────────────────
   Annotation quota — client helper for the server-authoritative count.

   The per-domain / 24h cap number comes from the Kelviq entitlement, but the
   usage COUNT now lives on the backend (the `annotation-quota` Edge Function,
   keyed to the Clerk identity), so it survives a localStorage clear / incognito
   profile and can't be reset from devtools. This module invokes that function;
   the local ledger in annotation-quota.ts is kept only as the offline /
   unconfigured fallback (see isQuotaBackendActive).

   Mirrors the invoke / edgeErrorMessage pattern from kelviq-checkout.ts. Every
   call is authenticated with the caller's Clerk session token (x-clerk-token),
   which the function verifies server-side.
───────────────────────────────────────────────────────────────────────── */

import { supabase } from './supabase'
import { isKelviqConfigured } from './kelviq'

/** The backend quota is active only when Supabase + Kelviq are both configured
    (isKelviqConfigured already requires Supabase). When false, callers fall
    back to the local localStorage ledger (prototype behaviour). */
export const isQuotaBackendActive: boolean = isKelviqConfigured

export type GetToken = () => Promise<string | null>

export interface QuotaStatus {
  used: number
  /** Cap; Infinity = unlimited. */
  limit: number
  /** ms until at least one slot frees up, or null when nothing is queued. */
  resetsInMs: number | null
}

export interface ReserveResult extends QuotaStatus {
  allowed: boolean
}

/** The function returns `limit: number | null` (null = unlimited). Normalise
    null → Infinity so the client uses one numeric representation everywhere. */
function normLimit(v: unknown): number {
  return typeof v === 'number' ? v : Infinity
}

/** supabase-js surfaces a non-2xx Edge Function response as a FunctionsHttpError
    whose `.message` is generic; the actionable detail is in the response body
    (`{ error, reason }`) reachable via `error.context`. Pull that out. */
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

interface QuotaResponse {
  used?: number
  limit?: number | null
  resetsInMs?: number | null
  allowed?: boolean
}

/** Invoke the annotation-quota function with the Clerk token attached. Throws
    on any error (callers catch and fall back to the local ledger). */
async function invoke(
  body: { action: 'status' | 'reserve'; domain: string },
  getToken: GetToken,
): Promise<QuotaResponse> {
  if (!isQuotaBackendActive || !supabase) {
    throw new Error('Quota backend is not configured')
  }
  const token = await getToken()
  const { data, error } = await supabase.functions.invoke('annotation-quota', {
    headers: token ? { 'x-clerk-token': token } : undefined,
    body,
  })
  if (error) throw new Error(await edgeErrorMessage(error))
  return (data ?? {}) as QuotaResponse
}

/** Read the current usage for a domain (no write). */
export async function fetchQuotaStatus(
  domain: string,
  getToken: GetToken,
): Promise<QuotaStatus> {
  const d = await invoke({ action: 'status', domain }, getToken)
  return {
    used: d.used ?? 0,
    limit: normLimit(d.limit),
    resetsInMs: d.resetsInMs ?? null,
  }
}

/** Attempt to reserve one slot. On `allowed:true` the server has already
    recorded the event; on `allowed:false` nothing was written. */
export async function reserveAnnotation(
  domain: string,
  getToken: GetToken,
): Promise<ReserveResult> {
  const d = await invoke({ action: 'reserve', domain }, getToken)
  return {
    allowed: !!d.allowed,
    used: d.used ?? 0,
    limit: normLimit(d.limit),
    resetsInMs: d.resetsInMs ?? null,
  }
}

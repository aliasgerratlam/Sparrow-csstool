/* ─────────────────────────────────────────────────────────────────────────
   Annotation quota ledger — enforces the PER-DOMAIN, 24h-resetting annotation
   cap client-side (Free 3 / Pro 10 / Max unlimited).

   Why not reuse the store's per-page count? The cap spans the whole DOMAIN
   (every page on the host shares it) and resets on TIME, independent of
   deletions — so it can't be `items.length` on the current page's bucket.
   Kelviq meters are per-customer and can't scope per-domain, so the cap value
   comes from the entitlement while the count + reset live here.

   Model: a localStorage ledger keyed by hostname holds the timestamps (ms) of
   annotation CREATIONS. The window is a trailing 24h rolling from each event
   (creating an annotation "uses" a slot for 24h). Deleting an annotation does
   NOT refund the slot — the quota is a rate limit, not a live count. To switch
   to a fixed daily (midnight) reset instead, change `windowStart()` below.
───────────────────────────────────────────────────────────────────────── */

const WINDOW_MS = 24 * 60 * 60 * 1000
const KEY_PREFIX = 'annotquota:'

/** The domain the cap is scoped to. */
export function currentDomain(): string {
  try {
    return window.location.hostname || 'localhost'
  } catch {
    return 'localhost'
  }
}

/** Start of the active window — rolling 24h. (Swap for a midnight boundary to
    get a fixed daily reset instead.) */
function windowStart(nowMs: number): number {
  return nowMs - WINDOW_MS
}

function keyFor(host: string): string {
  return KEY_PREFIX + host
}

function read(host: string): number[] {
  try {
    const raw = window.localStorage.getItem(keyFor(host))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((n): n is number => typeof n === 'number')
      : []
  } catch {
    return []
  }
}

function write(host: string, stamps: number[]): void {
  try {
    if (stamps.length === 0) window.localStorage.removeItem(keyFor(host))
    else window.localStorage.setItem(keyFor(host), JSON.stringify(stamps))
  } catch {
    /* storage unavailable / full — degrade to no persistence. */
  }
}

/** Creation timestamps still inside the 24h window (prunes + persists older). */
function liveStamps(host: string, nowMs: number): number[] {
  const start = windowStart(nowMs)
  const all = read(host)
  const live = all.filter((t) => t > start)
  if (live.length !== all.length) write(host, live)
  return live
}

/** How many annotations were created on this domain within the window. */
export function usedInWindow(host: string = currentDomain()): number {
  return liveStamps(host, Date.now()).length
}

/** Whether another annotation may be created now (Infinity limit = always). */
export function canCreate(
  host: string,
  limit: number,
): boolean {
  if (!Number.isFinite(limit)) return true
  return usedInWindow(host) < limit
}

/** Record a successful creation against the quota (no-op for unlimited). */
export function recordCreate(host: string = currentDomain()): void {
  const now = Date.now()
  const live = liveStamps(host, now)
  live.push(now)
  write(host, live)
}

/** ms until at least one slot frees up (the oldest in-window event ages out),
    or null when nothing is queued / no window is active. */
export function msUntilReset(host: string = currentDomain()): number | null {
  const live = liveStamps(host, Date.now())
  if (live.length === 0) return null
  const oldest = Math.min(...live)
  return Math.max(0, oldest + WINDOW_MS - Date.now())
}

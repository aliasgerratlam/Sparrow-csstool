import { describe, expect, it } from 'vitest'
import { PLAN_IDS, PLAN_LIMITS, shareExpiryLabel } from './plans'
import {
  ANNOTATION_CAP,
  SHARE_EXPIRY_MS,
} from '../../supabase/functions/_shared/plans'

/* The Edge Functions run on Deno and can't import `@/lib/plans`, so the per-tier
   numbers are duplicated in supabase/functions/_shared/plans.ts under a "KEEP IN
   SYNC" comment. A drift there is invisible and nasty: the server would enforce a
   different cap / lifetime than the UI promises. These tests are that guard.

   Importing the Deno module works because it contains no Deno APIs — and because
   tsconfig.app.json excludes *.test.ts, so reaching outside `src/` doesn't upset
   `tsc -b` (vitest is the only signal for this file).

   Convention bridging the two: the app uses `Infinity` for unlimited/never, the
   server and the wire use `null`. `Infinity` must never be JSON-serialized — it
   silently becomes null — so the two representations are deliberately distinct. */

/** The app's Infinity sentinel expressed the way the server writes it. */
const asServerValue = (v: number) => (Number.isFinite(v) ? v : null)

describe('plan limits stay in sync with the Edge Function copies', () => {
  it.each(PLAN_IDS)('annotation cap matches for %s', (plan) => {
    expect(ANNOTATION_CAP[plan]).toBe(
      asServerValue(PLAN_LIMITS[plan].annotationLimit),
    )
  })

  it.each(PLAN_IDS)('share-link lifetime matches for %s', (plan) => {
    expect(SHARE_EXPIRY_MS[plan]).toBe(
      asServerValue(PLAN_LIMITS[plan].shareExpiryMs),
    )
  })

  it('covers every plan on both sides (a new tier can’t be half-added)', () => {
    expect(Object.keys(SHARE_EXPIRY_MS).sort()).toEqual([...PLAN_IDS].sort())
    expect(Object.keys(ANNOTATION_CAP).sort()).toEqual([...PLAN_IDS].sort())
  })
})

describe('share-link lifetimes are the intended tiers', () => {
  it('grants Free 24h, Pro 30 days, and Max no expiry', () => {
    expect(PLAN_LIMITS.free.shareExpiryMs).toBe(24 * 60 * 60 * 1000)
    expect(PLAN_LIMITS.pro.shareExpiryMs).toBe(30 * 24 * 60 * 60 * 1000)
    expect(PLAN_LIMITS.max.shareExpiryMs).toBe(Infinity)
  })

  it('never lets a paid tier get a shorter link than Free', () => {
    expect(PLAN_LIMITS.pro.shareExpiryMs).toBeGreaterThan(
      PLAN_LIMITS.free.shareExpiryMs,
    )
    expect(PLAN_LIMITS.max.shareExpiryMs).toBeGreaterThan(
      PLAN_LIMITS.pro.shareExpiryMs,
    )
  })
})

describe('shareExpiryLabel', () => {
  it('labels each tier the way the share dialog quotes it', () => {
    expect(shareExpiryLabel(PLAN_LIMITS.free.shareExpiryMs)).toBe('24 hours')
    expect(shareExpiryLabel(PLAN_LIMITS.pro.shareExpiryMs)).toBe('30 days')
    expect(shareExpiryLabel(PLAN_LIMITS.max.shareExpiryMs)).toBe('never')
  })

  it('singularizes and rounds sensibly', () => {
    expect(shareExpiryLabel(60 * 60 * 1000)).toBe('1 hour')
    expect(shareExpiryLabel(2 * 60 * 60 * 1000)).toBe('2 hours')
    expect(shareExpiryLabel(48 * 60 * 60 * 1000)).toBe('2 days')
    // Sub-hour durations still read as a whole hour rather than "0 hours".
    expect(shareExpiryLabel(30 * 1000)).toBe('1 hour')
  })
})

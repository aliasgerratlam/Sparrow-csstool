import { describe, expect, it } from 'vitest'
import {
  canonicalizeUrl,
  isSameDocument,
  isSameSessionOrigin,
  isSessionExpired,
  originOf,
  shareUrlForPage,
} from './session'

/* Origin-binding for share links: a session created on one site must not open
   on another. `isSameSessionOrigin` is the pure decision the collab join effect
   uses to reject cross-domain reuse before any collaboration starts. */

const ORIGIN = 'https://lambda-demo-04.redpithemes.com'
const PAGE_URL = `${ORIGIN}/products/shirt?variant=blue`
const SESSION_ID = '0970b73e-92d3-469f-9a54-fb2b720d92b3'

describe('isSameSessionOrigin', () => {
  it('accepts the same origin regardless of path/query (session opens on its original domain)', () => {
    expect(isSameSessionOrigin(PAGE_URL, ORIGIN)).toBe(true)
    // A joiner on a different page of the SAME origin still passes the origin gate.
    expect(isSameSessionOrigin(`${ORIGIN}/about`, ORIGIN)).toBe(true)
    expect(isSameSessionOrigin(`${ORIGIN}/`, ORIGIN)).toBe(true)
  })

  it('rejects a different domain (the reported cross-domain reuse bug)', () => {
    expect(isSameSessionOrigin(PAGE_URL, 'https://another-website.com')).toBe(false)
  })

  it('rejects a different subdomain, port, or protocol', () => {
    expect(isSameSessionOrigin(`https://app.redpithemes.com/`, ORIGIN)).toBe(false)
    expect(isSameSessionOrigin(`${ORIGIN}:8443/`, ORIGIN)).toBe(false)
    expect(isSameSessionOrigin(`http://lambda-demo-04.redpithemes.com/`, ORIGIN)).toBe(false)
  })

  it('fails closed on a malformed or empty stored url', () => {
    expect(isSameSessionOrigin('not a url', ORIGIN)).toBe(false)
    expect(isSameSessionOrigin('', ORIGIN)).toBe(false)
  })
})

describe('originOf', () => {
  it('extracts scheme+host+port and returns null for junk', () => {
    expect(originOf(PAGE_URL)).toBe(ORIGIN)
    expect(originOf('http://example.com:3000/x')).toBe('http://example.com:3000')
    expect(originOf('nonsense')).toBeNull()
  })
})

describe('shareUrlForPage', () => {
  it('appends the session id onto the original page url (rebuilds the working link)', () => {
    expect(shareUrlForPage(PAGE_URL, SESSION_ID)).toBe(
      `${ORIGIN}/products/shirt?variant=blue&sparrow-session=${SESSION_ID}`,
    )
  })

  it('falls back to the raw page url when it cannot be parsed', () => {
    expect(shareUrlForPage('not a url', SESSION_ID)).toBe('not a url')
  })
})

/* Page identity. Every participant must derive the SAME string for the same
   page — it scopes the localStorage bucket, the Supabase `page_url` column, the
   realtime filter and the applyRemote* guard. A disagreement raises no error
   anywhere; each side just reads and writes its own private scope, so everyone
   sees only their own pins. */
describe('canonicalizeUrl', () => {
  it('strips the session param, the hash, and tracking params', () => {
    expect(
      canonicalizeUrl(`${ORIGIN}/p?sparrow-session=${SESSION_ID}`),
    ).toBe(`${ORIGIN}/p`)
    expect(canonicalizeUrl(`${ORIGIN}/p?session=${SESSION_ID}`)).toBe(`${ORIGIN}/p`)
    expect(canonicalizeUrl(`${ORIGIN}/p#anchor`)).toBe(`${ORIGIN}/p`)
    expect(canonicalizeUrl(`${ORIGIN}/p?utm_source=ad&gclid=x&_gl=y`)).toBe(
      `${ORIGIN}/p`,
    )
  })

  it('keeps meaningful params (they identify the page)', () => {
    expect(canonicalizeUrl(`${ORIGIN}/p?variant=blue&utm_medium=cpc`)).toBe(
      `${ORIGIN}/p?variant=blue`,
    )
  })

  it('host and joiner derive the same identity for the same page', () => {
    const host = canonicalizeUrl(`${ORIGIN}/products/shirt?variant=blue`)
    const joiner = canonicalizeUrl(
      `${ORIGIN}/products/shirt?variant=blue&sparrow-session=${SESSION_ID}#top`,
    )
    expect(joiner).toBe(host)
  })

  /* The regression: when `new URL()` is unusable the fallback used to return the
     raw href, so a joiner's ?sparrow-session= survived into their page identity
     and nobody saw anyone else's annotations. Both branches must now agree. */
  it('falls back to the same identity when URL() is unavailable', () => {
    const withUrl = canonicalizeUrl(
      `${ORIGIN}/products/shirt?variant=blue&sparrow-session=${SESSION_ID}#top`,
    )
    const RealUrl = globalThis.URL
    // @ts-expect-error — deliberately break the fast path for this assertion.
    globalThis.URL = function () {
      throw new TypeError('URL unavailable')
    }
    try {
      expect(
        canonicalizeUrl(
          `${ORIGIN}/products/shirt?variant=blue&sparrow-session=${SESSION_ID}#top`,
        ),
      ).toBe(withUrl)
      expect(canonicalizeUrl(`${ORIGIN}/p?sparrow-session=${SESSION_ID}`)).toBe(
        `${ORIGIN}/p`,
      )
      expect(canonicalizeUrl(`${ORIGIN}/p?utm_source=ad&keep=1`)).toBe(
        `${ORIGIN}/p?keep=1`,
      )
    } finally {
      globalThis.URL = RealUrl
    }
  })
})

describe('isSameDocument', () => {
  it('treats query/hash-only differences as the same document (safe to re-scope)', () => {
    expect(isSameDocument(`${ORIGIN}/p`, `${ORIGIN}/p?foo=1`)).toBe(true)
    expect(isSameDocument(`${ORIGIN}/p?a=1`, `${ORIGIN}/p?b=2`)).toBe(true)
  })

  it('keeps genuinely different pages separate (never merge their annotations)', () => {
    expect(isSameDocument(`${ORIGIN}/p`, `${ORIGIN}/q`)).toBe(false)
    expect(isSameDocument(`${ORIGIN}/p`, 'https://other.com/p')).toBe(false)
  })
})

/* Share-link lifetime is plan-based and stamped once at creation (Free 24h / Pro
   30d / Max never). `isSessionExpired` is the client-side read of that stamp — it
   decides whether a joiner is let in and whether the host resets to no-session. */
describe('isSessionExpired', () => {
  const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString()

  it('treats a null/absent expires_at as never expiring (Max)', () => {
    expect(isSessionExpired({ expires_at: null })).toBe(false)
    expect(isSessionExpired({})).toBe(false)
  })

  it('accepts a link still inside its lifetime', () => {
    expect(isSessionExpired({ expires_at: iso(60_000) })).toBe(false)
    // Pro's 30 days.
    expect(isSessionExpired({ expires_at: iso(30 * 24 * 60 * 60 * 1000) })).toBe(
      false,
    )
  })

  it('rejects a link past its lifetime', () => {
    expect(isSessionExpired({ expires_at: iso(-1000) })).toBe(true)
    // Free's 24h, a minute overdue.
    expect(isSessionExpired({ expires_at: iso(-60_000) })).toBe(true)
  })

  it('fails OPEN on an unparseable timestamp (never lock a live room over a bad string)', () => {
    expect(isSessionExpired({ expires_at: 'not-a-date' })).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { isSameSessionOrigin, originOf, shareUrlForPage } from './session'

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

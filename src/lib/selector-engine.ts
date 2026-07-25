import type { SelectorRecord } from './types'

/* ─────────────────────────────────────────────────────────────────────────
   SelectorEngine — generate a stable unique selector for an element and
   resolve it back to a live element (used by pins/annotations across reloads
   AND across collaborators' browsers).

   Anchoring has to survive a DOM that differs from the one a record was minted
   against: two collaborators on the same live page can render structurally
   different markup (responsive/viewport-conditional sections, dynamic or
   animated content, hydration order). Pure `:nth-child` paths shift under any
   such difference and orphan the pin for the other participant. So a record
   also carries position-independent signals — a distinctive-attribute `primary`,
   an `:nth-of-type` path, whitelisted `attrs`, and a `text` fingerprint — and
   `resolve` walks an ordered fallback chain ending in a conservative,
   unique-match-only fingerprint search (never guesses between duplicates).
───────────────────────────────────────────────────────────────────────── */

function cssEsc(s: string): string {
  return window.CSS && CSS.escape
    ? CSS.escape(s)
    : String(s).replace(/([^\w-])/g, '\\$1')
}

/* Quote an attribute VALUE for a `[attr="…"]` selector (CSS.escape is for
   identifiers, not quoted strings — it would over-escape). */
function attrVal(s: string): string {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

function nth(el: Element): number {
  let i = 1
  let sib: Element | null = el
  while ((sib = sib.previousElementSibling)) i++
  return i
}

/* Position among same-tag siblings — unlike nth(), unaffected when a sibling of
   a DIFFERENT tag is conditionally inserted/removed (the common responsive
   divergence between two collaborators). */
function nthOfType(el: Element): number {
  let i = 1
  const name = el.localName
  let sib: Element | null = el
  while ((sib = sib.previousElementSibling)) {
    if (sib.localName === name) i++
  }
  return i
}

function stableClasses(el: Element): string[] {
  return Array.from(el.classList)
    .filter(
      (c) =>
        c.indexOf('scanner-') !== 0 &&
        c.indexOf('annot-') !== 0 &&
        !/[:[\]/().%#]/.test(c),
    )
    .slice(0, 2)
}

function nthPathOf(el: Element): string {
  const parts: string[] = []
  let cur: Element | null = el
  while (cur && cur.nodeType === 1 && cur.tagName.toLowerCase() !== 'html') {
    parts.unshift(cur.tagName.toLowerCase() + ':nth-child(' + nth(cur) + ')')
    if (cur.tagName.toLowerCase() === 'body') break
    cur = cur.parentElement
  }
  return parts.join(' > ')
}

function ofTypePathOf(el: Element): string {
  const parts: string[] = []
  let cur: Element | null = el
  while (cur && cur.nodeType === 1 && cur.tagName.toLowerCase() !== 'html') {
    parts.unshift(cur.localName + ':nth-of-type(' + nthOfType(cur) + ')')
    if (cur.tagName.toLowerCase() === 'body') break
    cur = cur.parentElement
  }
  return parts.join(' > ')
}

/* ── Resilience signals ─────────────────────────────────────────────────── */

const TEXT_MAX = 80
/** Text is only trustworthy for disambiguation once it's this long (a lone "›"
    or "x" would false-match half the page). */
const TEXT_MIN_USABLE = 3
const ATTR_VAL_MAX = 100
const ATTRS_MAX = 4
/** Candidate set larger than this is too generic to disambiguate safely. */
const CANDIDATE_CAP = 400

function normText(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, TEXT_MAX)
}

/* href/src differ between collaborators as absolute-vs-relative and with
   cache-busting query strings; keep only the path's last segment so the two
   sides still compare equal. Used at BOTH mint and resolve so they agree. */
function normUrlAttr(v: string): string {
  try {
    const u = new URL(v, location.href)
    const seg = u.pathname.split('/').filter(Boolean).pop()
    return seg || u.pathname
  } catch {
    const path = v.split(/[?#]/)[0] ?? v
    return path.split('/').filter(Boolean).pop() || v
  }
}

/* Whitelisted, normalized identifying attributes, in descending distinctiveness.
   Values keep their case (attribute values are case-sensitive). */
function stableAttrs(el: Element): Record<string, string> {
  const out: Record<string, string> = {}
  const tag = el.localName
  const names = [
    'data-testid',
    'name',
    'aria-label',
    'role',
    'type',
    'alt',
    'placeholder',
    'title',
  ]
  if (tag === 'a') names.unshift('href')
  if (tag === 'img') names.push('src')
  for (const n of names) {
    if (Object.keys(out).length >= ATTRS_MAX) break
    const raw = el.getAttribute(n)
    if (raw == null) continue
    let v = raw.replace(/\s+/g, ' ').trim()
    if (!v) continue
    if (n === 'href' || n === 'src') v = normUrlAttr(v)
    out[n] = v.slice(0, ATTR_VAL_MAX)
  }
  return out
}

/* A position-independent selector, if the element carries a distinctive,
   currently-unique attribute. Returns null when none is unique. */
function distinctiveSelector(el: Element): string | null {
  const tag = el.localName
  const attempts: string[] = []
  const testid = el.getAttribute('data-testid')
  if (testid) attempts.push('[data-testid=' + attrVal(testid) + ']')
  const name = el.getAttribute('name')
  if (name) attempts.push(tag + '[name=' + attrVal(name) + ']')
  if (tag === 'a') {
    const href = el.getAttribute('href')
    if (href) attempts.push('a[href=' + attrVal(href) + ']')
  }
  const aria = el.getAttribute('aria-label')
  if (aria) attempts.push(tag + '[aria-label=' + attrVal(aria) + ']')
  const role = el.getAttribute('role')
  const type = el.getAttribute('type')
  if (role && type)
    attempts.push(tag + '[role=' + attrVal(role) + '][type=' + attrVal(type) + ']')
  for (const sel of attempts) {
    try {
      if (document.querySelectorAll(sel).length === 1) return sel
    } catch {
      /* invalid selector — skip */
    }
  }
  return null
}

export function getUniqueSelector(el: Element): SelectorRecord {
  const tag = el.tagName.toLowerCase()
  let id: string | null = null
  let primary: string | null = null
  if (el.id) {
    try {
      if (document.querySelectorAll('#' + cssEsc(el.id)).length === 1) {
        id = el.id
        primary = '#' + cssEsc(el.id)
      }
    } catch {
      /* invalid id */
    }
  }
  // Prefer a distinctive-attribute selector over a positional path — it's
  // independent of where the element sits, so it survives DOM differences
  // between collaborators.
  if (!primary) primary = distinctiveSelector(el)
  if (!primary) {
    const segs: string[] = []
    let cur: Element | null = el
    while (cur && cur.nodeType === 1 && cur.tagName.toLowerCase() !== 'html') {
      let seg = cur.tagName.toLowerCase()
      const cls = stableClasses(cur)
      if (cls.length) seg += '.' + cls.map(cssEsc).join('.')
      // :nth-of-type instead of :nth-child — resilient to different-tag
      // siblings appearing/disappearing across responsive renders.
      seg += ':nth-of-type(' + nthOfType(cur) + ')'
      segs.unshift(seg)
      if (cur.tagName.toLowerCase() === 'body') break
      cur = cur.parentElement
    }
    primary = segs.join(' > ')
  }
  const nthPath = nthPathOf(el)
  try {
    document.querySelectorAll(primary)
  } catch {
    primary = nthPath // nthPath is the guaranteed fallback
  }
  return {
    primary,
    nthPath,
    id,
    tag,
    ofTypePath: ofTypePathOf(el),
    attrs: stableAttrs(el),
    text: normText(el.textContent),
  }
}

function tryQS(sel: string | null | undefined): Element | null {
  if (!sel) return null
  try {
    const l = document.querySelectorAll(sel)
    return l.length ? (l[0] as Element) : null
  } catch {
    return null
  }
}

/* Does a live element still match the record's stored fingerprint? Used both to
   validate a fingerprint candidate and to re-validate a cached hit in O(1). */
function matchesFingerprint(el: Element, rec: SelectorRecord): boolean {
  const wantText = rec.text && rec.text.length >= TEXT_MIN_USABLE
  if (wantText && normText(el.textContent) !== rec.text) return false
  if (rec.attrs) {
    for (const [k, v] of Object.entries(rec.attrs)) {
      const raw = el.getAttribute(k)
      if (raw == null) return false
      let cur = raw.replace(/\s+/g, ' ').trim()
      if (k === 'href' || k === 'src') cur = normUrlAttr(cur)
      if (cur.slice(0, ATTR_VAL_MAX) !== v) return false
    }
  }
  return true
}

/* Cache the (expensive) fingerprint scan per record. Keyed by the SelectorRecord
   object identity, which the store keeps stable across renders; a WeakMap frees
   the entry automatically when the annotation is removed. */
const fpCache = new WeakMap<SelectorRecord, Element>()

/* Last-resort resilience: find the element by content/attribute fingerprint when
   every structural selector missed. Conservative — attaches ONLY on a unique
   match, so it can never point a pin at the wrong one of several look-alikes. */
function fingerprintSearch(rec: SelectorRecord): Element | null {
  const hasText = !!(rec.text && rec.text.length >= TEXT_MIN_USABLE)
  const hasAttrs = !!(rec.attrs && Object.keys(rec.attrs).length)
  if (!hasText && !hasAttrs) return null

  const cached = fpCache.get(rec)
  if (cached && cached.isConnected && matchesFingerprint(cached, rec)) return cached

  // Narrow candidate query (never a full-DOM scan): strongest stored attr, else
  // tag + leaf classes from `primary`, else bare tag.
  const tag = rec.tag || '*'
  let candidateSel = tag
  if (rec.attrs) {
    const strong = ['data-testid', 'aria-label', 'name', 'alt', 'src', 'href']
    for (const k of strong) {
      const v = rec.attrs[k]
      if (v != null) {
        // href/src are stored NORMALIZED to a path segment (normUrlAttr), but the
        // live DOM attribute is the full URL — so an exact `[href="seg"]` would
        // never match. Narrow with `*=` (contains) and let matchesFingerprint
        // re-validate exactly. Other attrs are stored verbatim → exact is correct
        // (and tighter).
        const op = k === 'href' || k === 'src' ? '*=' : '='
        candidateSel = tag + '[' + k + op + attrVal(v) + ']'
        break
      }
    }
  }
  if (candidateSel === tag) {
    const leaf = rec.primary.split('>').pop()?.trim() || ''
    const cls = leaf.match(/\.[\w-]+/g)
    if (cls && cls.length) candidateSel = tag + cls.join('')
  }

  let list: NodeListOf<Element>
  try {
    list = document.querySelectorAll(candidateSel)
  } catch {
    return null
  }
  if (list.length === 0 || list.length > CANDIDATE_CAP) return null

  let hit: Element | null = null
  for (const el of Array.from(list)) {
    if (!matchesFingerprint(el, rec)) continue
    if (hit) return null // ambiguous — never guess between duplicates
    hit = el
  }
  if (hit) fpCache.set(rec, hit)
  return hit
}

/* Stable identifying attributes (href, data-testid, name, …) rarely differ
   between collaborators — unlike text, which localizes/changes — so a positional
   selector that lands on an element whose attrs contradict the record has almost
   certainly hit the WRONG element after a DOM divergence. Used to reject such a
   hit so resolve falls through to the position-independent fingerprint search.
   Records with no attrs validate trivially, preserving legacy behavior. */
function matchesAttrs(el: Element, rec: SelectorRecord): boolean {
  if (!rec.attrs) return true
  for (const [k, v] of Object.entries(rec.attrs)) {
    const raw = el.getAttribute(k)
    if (raw == null) return false
    let cur = raw.replace(/\s+/g, ' ').trim()
    if (k === 'href' || k === 'src') cur = normUrlAttr(cur)
    if (cur.slice(0, ATTR_VAL_MAX) !== v) return false
  }
  return true
}

export function resolve(rec: SelectorRecord | null): Element | null {
  if (!rec) return null
  if (rec.id) {
    const e = tryQS('#' + cssEsc(rec.id))
    if (e) return e
  }
  // A positional selector can silently land on the wrong element when the DOM has
  // diverged; trust a hit only when the element's stable attrs still agree (see
  // matchesAttrs). A rejected hit falls through to the fingerprint search rather
  // than pinning the wrong element.
  const posHit = (sel: string | null | undefined): Element | null => {
    const el = tryQS(sel)
    return el && matchesAttrs(el, rec) ? el : null
  }
  let e = posHit(rec.primary)
  if (e) return e
  e = posHit(rec.ofTypePath)
  if (e) return e
  e = posHit(rec.nthPath)
  if (e) return e
  return fingerprintSearch(rec)
}

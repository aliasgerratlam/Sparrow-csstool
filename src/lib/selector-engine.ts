import type { SelectorRecord } from './types'

/* ─────────────────────────────────────────────────────────────────────────
   SelectorEngine — generate a stable unique selector for an element and
   resolve it back to a live element (used by pins/annotations across reloads).
───────────────────────────────────────────────────────────────────────── */

function cssEsc(s: string): string {
  return window.CSS && CSS.escape
    ? CSS.escape(s)
    : String(s).replace(/([^\w-])/g, '\\$1')
}

function nth(el: Element): number {
  let i = 1
  let sib: Element | null = el
  while ((sib = sib.previousElementSibling)) i++
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
  if (!primary) {
    const segs: string[] = []
    let cur: Element | null = el
    while (cur && cur.nodeType === 1 && cur.tagName.toLowerCase() !== 'html') {
      let seg = cur.tagName.toLowerCase()
      const cls = stableClasses(cur)
      if (cls.length) seg += '.' + cls.map(cssEsc).join('.')
      seg += ':nth-child(' + nth(cur) + ')'
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
  return { primary, nthPath, id, tag }
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

export function resolve(rec: SelectorRecord | null): Element | null {
  if (!rec) return null
  if (rec.id) {
    const e = tryQS('#' + cssEsc(rec.id))
    if (e) return e
  }
  let e = tryQS(rec.primary)
  if (e) return e
  e = tryQS(rec.nthPath)
  if (e) return e
  return null
}

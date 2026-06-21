import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from './lz-string'
import type { Annotation } from './types'

/* ─────────────────────────────────────────────────────────────────────────
   ShareCodec — key-minify + LZ + URL fragment. Round-trips the annotation
   list to a compact, URL-safe payload.
───────────────────────────────────────────────────────────────────────── */

type KeyMap = Record<string, string>

const A: KeyMap = {
  id: 'i',
  selector: 's',
  comment: 'c',
  category: 'g',
  status: 't',
  author: 'a',
  createdAt: 'd',
  styling: 'y',
  suggestedChanges: 'x',
  replies: 'r',
  pageUrl: 'u',
}
const SEL: KeyMap = { primary: 'p', nthPath: 'n', id: 'i', tag: 't' }
const STY: KeyMap = {
  fontSize: 'fs',
  fontFamily: 'ff',
  fontWeight: 'fw',
  bold: 'b',
  italic: 'it',
  underline: 'u',
  color: 'c',
  background: 'bg',
}
const REP: KeyMap = { id: 'i', author: 'a', message: 'm', createdAt: 'd' }

type AnyObj = Record<string, unknown>

function mapObj(obj: AnyObj, map: KeyMap): AnyObj {
  const o: AnyObj = {}
  for (const k in obj) {
    const mk = map[k]
    if (mk != null) o[mk] = obj[k]
  }
  return o
}
function invert(map: KeyMap): KeyMap {
  const inv: KeyMap = {}
  for (const k in map) inv[map[k] as string] = k
  return inv
}
function unmapObj(obj: AnyObj, map: KeyMap): AnyObj {
  const inv = invert(map)
  const o: AnyObj = {}
  for (const k in obj) {
    const ik = inv[k]
    if (ik != null) o[ik] = obj[k]
  }
  return o
}

function minify(items: Annotation[]): AnyObj[] {
  return items.map((ann) => {
    const m = mapObj(ann as unknown as AnyObj, A)
    if (ann.selector) m[A.selector as string] = mapObj(ann.selector as unknown as AnyObj, SEL)
    if (ann.styling) m[A.styling as string] = mapObj(ann.styling as unknown as AnyObj, STY)
    if (ann.replies)
      m[A.replies as string] = ann.replies.map((r) => mapObj(r as unknown as AnyObj, REP))
    return m
  })
}

function expand(arr: AnyObj[]): Annotation[] {
  return arr.map((m) => {
    const ann = unmapObj(m, A)
    const sel = m[A.selector as string]
    if (sel) ann.selector = unmapObj(sel as AnyObj, SEL)
    const sty = m[A.styling as string]
    if (sty) ann.styling = unmapObj(sty as AnyObj, STY)
    const reps = m[A.replies as string]
    ann.replies = Array.isArray(reps)
      ? reps.map((r) => unmapObj(r as AnyObj, REP))
      : []
    if (!ann.suggestedChanges) ann.suggestedChanges = {}
    return ann as unknown as Annotation
  })
}

export function encode(items: Annotation[]): string {
  return compressToEncodedURIComponent(JSON.stringify(minify(items)))
}

export function decode(payload: string): Annotation[] | null {
  try {
    const json = decompressFromEncodedURIComponent(payload)
    if (!json) return null
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? expand(arr) : null
  } catch {
    return null
  }
}

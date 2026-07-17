import { canonicalPageUrl } from '@/lib/session'
import type { Annotation } from '@/lib/types'

/* ─────────────────────────────────────────────────────────────────────────
   Reply-seen ledger — a per-browser, page-scoped record of how many of OTHER
   people's replies the user has already read on each annotation. Drives the
   unread-reply dot on annotation pins.

   Client-side only (localStorage), mirroring annotation-quota's pattern: no DB
   schema, mapper, or realtime involvement — a "someone replied" hint doesn't
   need cross-device durability. Count-based (not timestamp-based) so it's immune
   to cross-machine clock skew and ignores reply edits (an edit doesn't change
   the count, and there is no reply delete).
───────────────────────────────────────────────────────────────────────── */

// Same page identity the annotation store scopes by, so the ledger lines up with
// the annotations it tracks.
const KEY = 'annot:reply-seen:' + canonicalPageUrl()

// annotationId -> count of others' replies already seen
type Ledger = Record<string, number>

let ledger: Ledger = load()
let version = 0
const listeners = new Set<() => void>()

function load(): Ledger {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const obj = JSON.parse(raw)
      if (obj && typeof obj === 'object') return obj as Ledger
    }
  } catch {
    /* corrupt / privacy mode */
  }
  return {}
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ledger))
  } catch {
    /* quota / privacy mode */
  }
}

function emit(): void {
  version++
  listeners.forEach((fn) => {
    try {
      fn()
    } catch {
      /* listener errors are non-fatal */
    }
  })
}

/** Number of replies on `ann` authored by someone other than `myName`. */
function othersReplyCount(ann: Annotation, myName: string): number {
  const me = (myName || '').trim()
  return (ann.replies || []).reduce(
    (n, r) => (((r.author || '').trim() !== me ? 1 : 0) + n),
    0,
  )
}

/** Subscribe to seen-state changes (React binding lives in use-reply-seen). */
export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Monotonic version bumped on every ledger write — used as the store snapshot. */
export function getVersion(): number {
  return version
}

/** Whether `ann` has an unread reply from someone other than `myName`. */
export function hasUnreadReplies(ann: Annotation, myName: string): boolean {
  return othersReplyCount(ann, myName) > (ledger[ann.id] ?? 0)
}

/** Mark every current reply on `ann` as seen (call when its card is open). */
export function markSeen(ann: Annotation, myName: string): void {
  const count = othersReplyCount(ann, myName)
  if (ledger[ann.id] === count) return
  ledger[ann.id] = count
  save()
  emit()
}

import { canonicalPageUrl } from '@/lib/session'
import type { Annotation } from '@/lib/types'

/* ─────────────────────────────────────────────────────────────────────────
   Seen ledgers — a per-browser, page-scoped record of which of OTHER people's
   activity the user has already looked at. Two ledgers:

     • replies — how many of others' replies were read on each annotation
     • pins    — which annotations created by others have been opened

   Together they drive the unread-reply dot on annotation pins and the toolbar
   notification bell (see use-notifications).

   Client-side only (localStorage), mirroring annotation-quota's pattern: no DB
   schema, mapper, or realtime involvement — a "someone replied" hint doesn't
   need cross-device durability. Replies are count-based (not timestamp-based) so
   they're immune to cross-machine clock skew and ignore reply edits (an edit
   doesn't change the count, and there is no reply delete).

   Two separate storage keys rather than one merged object: the reply ledger
   predates the pin one, and keeping its `Record<id, number>` shape intact avoids
   a migration. Both share this module's version/listeners, so a write to either
   re-renders every subscriber.
───────────────────────────────────────────────────────────────────────── */

// Same page identity the annotation store scopes by, so the ledgers line up with
// the annotations they track.
const KEY = 'annot:reply-seen:' + canonicalPageUrl()
const PIN_KEY = 'annot:pin-seen:' + canonicalPageUrl()

// annotationId -> count of others' replies already seen
type Ledger = Record<string, number>
// annotationId -> 1 (present = this pin has been opened). A set stored as an
// object so it JSON-round-trips like the reply ledger.
type PinLedger = Record<string, 1>

let ledger: Ledger = load()
let pinLedger: PinLedger = loadPins()
let version = 0
const listeners = new Set<() => void>()

function readObject(key: string): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const obj = JSON.parse(raw)
      if (obj && typeof obj === 'object') return obj as Record<string, unknown>
    }
  } catch {
    /* corrupt / privacy mode */
  }
  return {}
}

function load(): Ledger {
  return readObject(KEY) as Ledger
}

function loadPins(): PinLedger {
  return readObject(PIN_KEY) as PinLedger
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ledger))
  } catch {
    /* quota / privacy mode */
  }
}

function savePins(): void {
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify(pinLedger))
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

/** Whether `author` is someone other than us. Blank names are treated as
 *  "someone else" so an unnamed collaborator's activity still registers. */
function isOthers(author: string | undefined, myName: string): boolean {
  return (author || '').trim() !== (myName || '').trim()
}

/** Number of replies on `ann` authored by someone other than `myName`. */
function othersReplyCount(ann: Annotation, myName: string): number {
  return (ann.replies || []).reduce(
    (n, r) => n + (isOthers(r.author, myName) ? 1 : 0),
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

/** Ids of others' replies on `ann` not yet seen, oldest first. The ledger counts
 *  how many were already read, so the unread ones are the trailing slice. Read
 *  this BEFORE markSeen() — it's what the card flashes to point them out. */
export function unreadReplyIds(ann: Annotation, myName: string): string[] {
  const others = (ann.replies || []).filter((r) => isOthers(r.author, myName))
  return others.slice(ledger[ann.id] ?? 0).map((r) => r.id)
}

/** Mark every current reply on `ann` as seen (call when its card is open). */
export function markSeen(ann: Annotation, myName: string): void {
  const count = othersReplyCount(ann, myName)
  if (ledger[ann.id] === count) return
  ledger[ann.id] = count
  save()
  emit()
}

/** Whether `ann` was created by someone else and hasn't been opened yet. */
export function isPinUnseen(ann: Annotation, myName: string): boolean {
  return isOthers(ann.author, myName) && !pinLedger[ann.id]
}

/** Mark a single pin seen — its card was opened, or we just created it. */
export function markPinSeen(ann: Annotation): void {
  if (pinLedger[ann.id]) return
  pinLedger[ann.id] = 1
  savePins()
  emit()
}

/** Mark every pin and reply in `items` as seen ("Mark all read"). Writes both
 *  ledgers in one pass so subscribers re-render once. */
export function markAllSeen(items: Annotation[], myName: string): void {
  let changed = false
  for (const ann of items) {
    const count = othersReplyCount(ann, myName)
    if (ledger[ann.id] !== count) {
      ledger[ann.id] = count
      changed = true
    }
    if (!pinLedger[ann.id]) {
      pinLedger[ann.id] = 1
      changed = true
    }
  }
  if (!changed) return
  save()
  savePins()
  emit()
}

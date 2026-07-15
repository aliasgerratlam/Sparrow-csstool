import type {
  Annotation,
  AnnotationStyling,
  Counts,
  Role,
  Status,
} from '@/lib/types'
import { supabase, isCollabEnabled, ANNOTATIONS_TABLE } from '@/lib/supabase'
import { canonicalPageUrl } from '@/lib/session'
import { fromRow, toRow, type AnnotationRow } from '@/lib/annotation-mapper'
import {
  canCreate,
  currentDomain,
  msUntilReset,
  recordCreate,
  usedInWindow,
} from '@/lib/annotation-quota'

/* ─────────────────────────────────────────────────────────────────────────
   Annotation store — a framework-agnostic external store (subscribe/emit +
   localStorage persistence + author/client roles). Consumed from React via
   useSyncExternalStore. Kept portable for a future browser extension.

   Writes replace the `items` array (immutable) so reference-equality change
   detection works for useSyncExternalStore.
───────────────────────────────────────────────────────────────────────── */

export const STATUSES: Status[] = ['Open', 'Resolved']
const STATUS_OK = new Set<string>(STATUSES)

const PAGE = canonicalPageUrl()

let items: Annotation[] = []
let role: Role = 'author'
// Per-domain / 24h annotation cap, fed from the live subscription entitlement
// (see AnnotationLimitSync). Defaults to unlimited so nothing blocks before the
// limit is known or when gating is off (prototype mode).
let annotationLimit = Infinity
const listeners = new Set<() => void>()
let saveTimer: ReturnType<typeof setTimeout> | null = null

function storageKey(): string {
  return (role === 'client' ? 'annot:client:' : 'annot:') + PAGE
}

function newId(): string {
  try {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID()
  } catch {
    /* ignore */
  }
  return (
    'a' +
    Date.now().toString(36) +
    Math.floor(Math.random() * 1e9).toString(36)
  )
}

function now(): string {
  return new Date().toISOString()
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(save, 300)
}

function notify(): void {
  listeners.forEach((fn) => {
    try {
      fn()
    } catch {
      /* listener errors are non-fatal */
    }
  })
}

function emit(): void {
  notify()
  scheduleSave()
}

function save(): void {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(items))
  } catch {
    /* quota / privacy mode */
  }
}

/* ── Supabase sync ──────────────────────────────────────────────────────────
   Mutations update `items` optimistically (local feel, offline cache) and then
   mirror to Supabase. Inbound realtime changes call applyRemote* which mutate
   `items` WITHOUT pushing back — upsert-by-id makes our own echoes idempotent.
   All paths no-op when collab is disabled. */

function pushUpsert(ann: Annotation): void {
  if (!isCollabEnabled || !supabase) return
  const row = toRow(ann)
  void supabase
    .from(ANNOTATIONS_TABLE)
    .upsert(row, { onConflict: 'id' })
    .then(
      ({ error }) => {
        if (error) console.warn('[collab] upsert failed', error.message)
      },
      // Network-level throw (not a PostgREST error) — must not become an
      // unhandled rejection.
      (e: unknown) => console.warn('[collab] upsert failed', e),
    )
}

function pushDelete(id: string): void {
  if (!isCollabEnabled || !supabase) return
  void supabase
    .from(ANNOTATIONS_TABLE)
    .delete()
    .eq('id', id)
    .then(
      ({ error }) => {
        if (error) console.warn('[collab] delete failed', error.message)
      },
      (e: unknown) => console.warn('[collab] delete failed', e),
    )
}

/** Apply a remote INSERT/UPDATE: upsert into `items` by id, no write-back. */
export function applyRemoteUpsert(row: AnnotationRow): void {
  const ann = fromRow(row)
  if (ann.pageUrl && ann.pageUrl !== PAGE) return
  const i = index(ann.id)
  if (i >= 0) {
    // Skip no-op churn when the incoming row matches what we already have.
    if (JSON.stringify(items[i]) === JSON.stringify(ann)) return
    items = items.map((a) => (a.id === ann.id ? ann : a))
  } else {
    items = [...items, ann]
  }
  emit()
}

/** Apply a remote DELETE: drop from `items`, no write-back. */
export function applyRemoteDelete(id: string): void {
  if (index(id) < 0) return
  items = items.filter((a) => a.id !== id)
  emit()
}

/** Load all annotations for this page from Supabase (late-joiner hydrate).
    Merges with the in-memory list instead of replacing it, so a local write
    that hasn't finished its async push (offline, slow round-trip) isn't wiped
    out — and then persisted as wiped — by a join or realtime reconnect. */
export async function hydrateFromDb(): Promise<void> {
  if (!isCollabEnabled || !supabase) return
  let data: unknown
  try {
    const res = await supabase
      .from(ANNOTATIONS_TABLE)
      .select('*')
      .eq('page_url', PAGE)
    if (res.error) {
      console.warn('[collab] hydrate failed', res.error.message)
      return
    }
    data = res.data
  } catch (e) {
    console.warn('[collab] hydrate failed', e)
    return
  }
  if (!Array.isArray(data)) return
  const dbById = new Map<string, Annotation>()
  data.forEach((row) => {
    const ann = fromRow(row as AnnotationRow)
    dbById.set(ann.id, ann)
  })
  const ts = (a: Annotation) =>
    Date.parse(a.updatedAt || a.createdAt || '') || 0
  const merged: Annotation[] = []
  const toPush: Annotation[] = []
  for (const local of items) {
    const remote = dbById.get(local.id)
    if (!remote) {
      // Local-only item. Authors keep it and re-push (it never reached the DB
      // or arrived after our select); for clients the DB is canonical — a
      // missing id means the author deleted it — so drop it.
      if (role === 'author') {
        merged.push(local)
        toPush.push(local)
      }
      continue
    }
    dbById.delete(local.id)
    if (ts(local) > ts(remote)) {
      merged.push(local)
      toPush.push(local)
    } else {
      merged.push(remote) // tie → DB wins (canonical)
    }
  }
  for (const remote of dbById.values()) merged.push(remote)
  items = merged
  emit()
  // Echo-idempotent: the upsert comes back through applyRemoteUpsert, which
  // compares equal (updated_at passes through the mapper unchanged) and no-ops.
  toPush.forEach(pushUpsert)
}

/* Coerce a possibly-corrupt / legacy-schema localStorage entry into a fully
   shaped Annotation (mirrors fromRow's defaults). Entries with no usable id
   are dropped. Without this, a missing `comment`/`replies` crashes render. */
function sanitizeItem(a: unknown): Annotation | null {
  if (!a || typeof a !== 'object') return null
  const r = a as Partial<Annotation> & Record<string, unknown>
  if (!r.id || typeof r.id !== 'string') return null
  return {
    id: r.id,
    pageUrl: typeof r.pageUrl === 'string' ? r.pageUrl : PAGE,
    selector: r.selector ?? null,
    comment: typeof r.comment === 'string' ? r.comment : '',
    category: r.category ?? 'General',
    status: STATUS_OK.has(r.status as string) ? (r.status as Status) : 'Open',
    author: typeof r.author === 'string' ? r.author : '',
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : '',
    updatedAt:
      typeof r.updatedAt === 'string'
        ? r.updatedAt
        : typeof r.createdAt === 'string'
          ? r.createdAt
          : '',
    styling: r.styling ?? defaultStyling(),
    suggestedChanges: r.suggestedChanges ?? {},
    replies: Array.isArray(r.replies) ? r.replies : [],
  }
}

export function load(): void {
  try {
    const raw = localStorage.getItem(storageKey())
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr))
        items = arr.map(sanitizeItem).filter((a): a is Annotation => a !== null)
    }
  } catch {
    /* corrupt storage */
  }
}

/* Re-read from localStorage and notify listeners WITHOUT persisting. Used when
   auth gates visibility: annotations load once the user signs in (see
   AnnotationAuthSync). Resets first so a stale list can't linger. */
export function reloadFromStorage(): void {
  items = []
  load()
  notify()
}

/* Drop the in-memory list and notify, but KEEP the localStorage copy — so a
   signed-out user sees no annotations/review count while their data survives
   for the next sign-in. */
export function unload(): void {
  if (items.length === 0) return
  items = []
  notify()
}

export function defaultStyling(): AnnotationStyling {
  return {
    fontSize: '14px',
    fontFamily: 'system-ui',
    fontWeight: '400',
    bold: false,
    italic: false,
    underline: false,
    color: '#2b3245',
    background: 'transparent',
  }
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getSnapshot(): Annotation[] {
  return items
}

export function get(id: string): Annotation | null {
  return items.find((a) => a.id === id) || null
}

export function index(id: string): number {
  return items.findIndex((a) => a.id === id)
}

export interface AnnotationDraft {
  selector: Annotation['selector']
  comment?: string
  category?: Annotation['category']
  author?: string
  styling?: AnnotationStyling
  suggestedChanges?: Record<string, string>
}

export function add(partial: AnnotationDraft): Annotation | null {
  if (role !== 'author') return null
  // Per-domain / 24h cap (Free 3 / Pro 10 / Max unlimited). Enforced here so
  // no code path — UI, collab, or otherwise — can exceed it.
  const host = currentDomain()
  if (!canCreate(host, annotationLimit)) return null
  const ann: Annotation = {
    id: newId(),
    pageUrl: PAGE,
    selector: partial.selector || null,
    comment: partial.comment || '',
    category: partial.category || 'General',
    status: 'Open',
    author: partial.author || '',
    createdAt: now(),
    updatedAt: now(),
    styling: partial.styling || defaultStyling(),
    suggestedChanges: partial.suggestedChanges || {},
    replies: [],
  }
  items = [...items, ann]
  recordCreate(host)
  emit()
  pushUpsert(ann)
  return ann
}

/* ── Annotation quota (per-domain / 24h) ─────────────────────────────────── */

/** Set the current per-domain cap (Infinity = unlimited). */
export function setAnnotationLimit(limit: number): void {
  if (limit === annotationLimit) return
  annotationLimit = limit
  notify() // re-render quota-aware UI; do NOT emit (no data changed)
}

/** Whether the author may add another annotation on this domain right now. */
export function canAddAnnotation(): boolean {
  return role === 'author' && canCreate(currentDomain(), annotationLimit)
}

/** Quota snapshot for UI ("used / cap · resets in …"). */
export function annotationQuota(): {
  used: number
  limit: number
  resetsInMs: number | null
} {
  return {
    used: usedInWindow(currentDomain()),
    limit: annotationLimit,
    resetsInMs: msUntilReset(currentDomain()),
  }
}

const CLIENT_WRITABLE: Record<string, boolean> = { status: true }

export function update(id: string, patch: Partial<Annotation>): void {
  const ann = get(id)
  if (!ann) return
  const next: Annotation = { ...ann }
  if (role === 'client') {
    const writable = next as unknown as Record<string, unknown>
    ;(Object.keys(patch) as (keyof Annotation)[]).forEach((k) => {
      if (CLIENT_WRITABLE[k as string]) writable[k as string] = patch[k]
    })
  } else {
    Object.assign(next, patch)
  }
  next.updatedAt = now()
  items = items.map((a) => (a.id === id ? next : a))
  emit()
  pushUpsert(next)
}

export function setStatus(id: string, status: Status): void {
  const ann = get(id)
  if (!ann || !STATUS_OK.has(status)) return
  const next: Annotation = { ...ann, status, updatedAt: now() }
  items = items.map((a) => (a.id === id ? next : a))
  emit()
  pushUpsert(next)
}

export function addReply(
  id: string,
  reply: { author?: string; message?: string },
): void {
  const ann = get(id)
  if (!ann) return
  const next: Annotation = {
    ...ann,
    updatedAt: now(),
    replies: [
      ...(ann.replies || []),
      {
        id: newId(),
        author: reply.author || 'Anonymous',
        message: reply.message || '',
        createdAt: now(),
      },
    ],
  }
  items = items.map((a) => (a.id === id ? next : a))
  emit()
  pushUpsert(next)
}

/* Rewrite an existing reply's message. Permission (only the reply's own author
   may edit it) is enforced by the caller — mirrors addReply, which is likewise
   role-agnostic so a client can edit the reply they wrote. */
export function updateReply(
  id: string,
  replyId: string,
  patch: { message?: string },
): void {
  const ann = get(id)
  if (!ann) return
  const replies = ann.replies || []
  if (!replies.some((r) => r.id === replyId)) return
  const next: Annotation = {
    ...ann,
    updatedAt: now(),
    replies: replies.map((r) =>
      r.id === replyId
        ? { ...r, message: patch.message ?? r.message }
        : r,
    ),
  }
  items = items.map((a) => (a.id === id ? next : a))
  emit()
  pushUpsert(next)
}

export function remove(id: string): void {
  if (role !== 'author') return
  const i = index(id)
  if (i >= 0) {
    items = items.filter((a) => a.id !== id)
    emit()
    pushDelete(id)
  }
}

export function counts(): Counts {
  let open = 0
  let resolved = 0
  items.forEach((a) => {
    if (a.status === 'Resolved') resolved++
    else if (a.status === 'Open') open++
  })
  return { total: items.length, open, resolved }
}

export function setRole(r: Role): void {
  if (r === role) return
  role = r
  // notify, NOT emit — an emit would save() the current list into the new
  // role's localStorage bucket (cross-bucket contamination).
  notify()
}

export function getRole(): Role {
  return role
}

/* Who may rewrite an annotation's comment: only an author whose name matches
   the annotation's recorded author. Annotations with no recorded author are
   left editable so they can't get permanently locked. */
export function canEdit(ann: Annotation, authorName: string): boolean {
  if (role !== 'author') return false
  const owner = (ann.author || '').trim()
  return !owner || owner === (authorName || '').trim()
}

/* Stable display numbering — pins/cards/sidebar rows must show the SAME number
   to every collaborator regardless of arrival order, so sort by creation time
   (id as a deterministic tiebreak) rather than using the raw array index. */
export function displayNumbers(list: Annotation[]): Map<string, number> {
  const sorted = [...list].sort((a, b) => {
    const ta = Date.parse(a.createdAt || '') || 0
    const tb = Date.parse(b.createdAt || '') || 0
    if (ta !== tb) return ta - tb
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  const map = new Map<string, number>()
  sorted.forEach((a, i) => map.set(a.id, i + 1))
  return map
}

export { newId }

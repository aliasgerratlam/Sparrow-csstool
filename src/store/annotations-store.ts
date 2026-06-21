import type {
  Annotation,
  AnnotationStyling,
  Counts,
  Role,
  Status,
} from '@/lib/types'

/* ─────────────────────────────────────────────────────────────────────────
   Annotation store — a framework-agnostic external store (subscribe/emit +
   localStorage persistence + author/client roles). Consumed from React via
   useSyncExternalStore. Kept portable for a future browser extension.

   Writes replace the `items` array (immutable) so reference-equality change
   detection works for useSyncExternalStore.
───────────────────────────────────────────────────────────────────────── */

export const STATUSES: Status[] = ['Open', 'Resolved']
const STATUS_OK = new Set<string>(STATUSES)

const PAGE = location.href.split('#')[0] as string

let items: Annotation[] = []
let role: Role = 'author'
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

function emit(): void {
  listeners.forEach((fn) => {
    try {
      fn()
    } catch {
      /* listener errors are non-fatal */
    }
  })
  scheduleSave()
}

function save(): void {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(items))
  } catch {
    /* quota / privacy mode */
  }
}

export function load(): void {
  try {
    const raw = localStorage.getItem(storageKey())
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) items = arr
    }
  } catch {
    /* corrupt storage */
  }
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
  const ann: Annotation = {
    id: newId(),
    pageUrl: PAGE,
    selector: partial.selector || null,
    comment: partial.comment || '',
    category: partial.category || 'General',
    status: 'Open',
    author: partial.author || '',
    createdAt: now(),
    styling: partial.styling || defaultStyling(),
    suggestedChanges: partial.suggestedChanges || {},
    replies: [],
  }
  items = [...items, ann]
  emit()
  return ann
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
  items = items.map((a) => (a.id === id ? next : a))
  emit()
}

export function setStatus(id: string, status: Status): void {
  const ann = get(id)
  if (!ann || !STATUS_OK.has(status)) return
  items = items.map((a) => (a.id === id ? { ...a, status } : a))
  emit()
}

export function addReply(
  id: string,
  reply: { author?: string; message?: string },
): void {
  const ann = get(id)
  if (!ann) return
  const next: Annotation = {
    ...ann,
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
}

export function remove(id: string): void {
  if (role !== 'author') return
  const i = index(id)
  if (i >= 0) {
    items = items.filter((a) => a.id !== id)
    emit()
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
  role = r
}

export function getRole(): Role {
  return role
}

export function seedFromShare(seed: Annotation[]): void {
  items = Array.isArray(seed) ? seed : []
}

// Overlay a client's locally-saved status/replies onto shared (author) items.
export function applyClientOverlay(): void {
  try {
    const raw = localStorage.getItem('annot:client:' + PAGE)
    if (!raw) return
    const saved = JSON.parse(raw)
    if (!Array.isArray(saved)) return
    const byId: Record<string, Annotation> = {}
    saved.forEach((s: Annotation) => (byId[s.id] = s))
    items = items.map((a) => {
      const s = byId[a.id]
      if (!s) return a
      return { ...a, status: s.status || a.status, replies: s.replies ?? a.replies }
    })
  } catch {
    /* ignore */
  }
}

export { newId }

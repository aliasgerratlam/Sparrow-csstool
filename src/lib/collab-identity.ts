import type { Role } from '@/lib/types'

/* ─────────────────────────────────────────────────────────────────────────
   Collab identity — who "I" am in a realtime room. Today the display name
   comes from the toolbar "Your name" field and `id` is a fresh per-tab UUID.
   This is the single seam to replace with the logged-in user once auth exists
   (see memory: annotate-author-from-auth) — keep the shape stable.
───────────────────────────────────────────────────────────────────────── */

export interface CollabUser {
  id: string
  name: string
  color: string
  role: Role
}

// Distinct, legible cursor/avatar colors.
const PALETTE = [
  '#e5484d', // red
  '#f76b15', // orange
  '#f5a623', // amber
  '#30a46c', // green
  '#0091ff', // blue
  '#3e63dd', // indigo
  '#8e4ec6', // purple
  '#e93d82', // pink
  '#12a594', // teal
]

/** Stable color picked from the id so a user keeps the same hue all session. */
export function colorForId(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length] as string
}

function freshId(): string {
  try {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID()
  } catch {
    /* ignore */
  }
  return 'u' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36)
}

// One id per tab/session (module-level, created once).
const SESSION_ID = freshId()

/** Build the current identity from the live name + role. */
export function makeIdentity(name: string, role: Role): CollabUser {
  const trimmed = name.trim()
  return {
    id: SESSION_ID,
    name: trimmed || 'Guest',
    color: colorForId(SESSION_ID),
    role,
  }
}

/** Up-to-two-letter initials for an avatar bubble. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return (parts[0] as string).slice(0, 2).toUpperCase()
  return (
    (parts[0] as string)[0]! + (parts[parts.length - 1] as string)[0]!
  ).toUpperCase()
}

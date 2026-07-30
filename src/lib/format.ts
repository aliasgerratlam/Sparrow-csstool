import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn class-merge helper. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** Format an ISO date for annotation/reply metadata. */
export function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso || ''
  }
}

/**
 * Compact timestamp for a reply — time alone for today, otherwise the date.
 * A thread is read top-to-bottom, so the long form only steals room from the
 * author's name; the full timestamp stays available as the element's `title`.
 */
export function fmtReplyTime(iso: string): string {
  try {
    const d = new Date(iso)
    const today = new Date()
    const sameDay =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    return d.toLocaleString(
      undefined,
      sameDay
        ? { hour: 'numeric', minute: '2-digit' }
        : { month: 'short', day: 'numeric' },
    )
  } catch {
    return iso || ''
  }
}

/** Up to two initials for an author avatar — "Ali Asger" → "AA", "gonig15@x.com" → "GO". */
export function authorInitials(name: string | undefined | null): string {
  // Email-shaped names: the domain says nothing about the person.
  const base = (name || '').trim().split('@')[0] || ''
  const parts = base.split(/[\s._-]+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

/**
 * Stable hue for an author's avatar, so the same person keeps the same colour
 * across the card, the drawer and every peer's screen (no stored palette).
 */
export function authorHue(name: string | undefined | null): number {
  const s = (name || '').trim().toLowerCase() || 'anonymous'
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return h
}

/** Coerce a CSS color to a #rrggbb hex, or return the fallback. */
export function toHex(c: string | null | undefined, fallback: string): string {
  if (!c || c === 'transparent') return fallback
  if (/^#[0-9a-f]{6}$/i.test(c)) return c
  const m = String(c).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (m) {
    return (
      '#' +
      [m[1], m[2], m[3]]
        .map((n) => (+(n ?? 0)).toString(16).padStart(2, '0'))
        .join('')
    )
  }
  return fallback
}

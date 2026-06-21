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

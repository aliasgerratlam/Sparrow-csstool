import type { CSSProperties } from 'react'

/* The five pin colours from the Sparrow design. A pin's colour is persisted in
   the annotation's existing `styling.background` field (already stored locally
   and mirrored to Supabase), so no schema change is involved — the swatches just
   write one of these hexes there. */
export interface PinColor {
  id: 'blue' | 'red' | 'amber' | 'green' | 'violet'
  name: string
  /** Pin / dot / outline colour. */
  hex: string
  /** Number colour on the pin. */
  fg: string
  /** Translucent wash behind the element chip in the composer. */
  tint: string
  /** Solid chip background + ink for the thread header. */
  chipBg: string
  chipInk: string
}

export const PIN_COLORS: readonly PinColor[] = [
  { id: 'blue', name: 'Blue', hex: '#2563eb', fg: '#ffffff', tint: 'rgba(37,99,235,0.1)', chipBg: '#eff6ff', chipInk: '#1e40af' },
  { id: 'red', name: 'Red', hex: '#dc2626', fg: '#ffffff', tint: 'rgba(220,38,38,0.08)', chipBg: '#fef2f2', chipInk: '#991b1b' },
  { id: 'amber', name: 'Amber', hex: '#f59e0b', fg: '#09090b', tint: 'rgba(245,158,11,0.12)', chipBg: '#fffbeb', chipInk: '#92400e' },
  { id: 'green', name: 'Green', hex: '#16a34a', fg: '#ffffff', tint: 'rgba(22,163,74,0.1)', chipBg: '#f0fdf4', chipInk: '#166534' },
  { id: 'violet', name: 'Violet', hex: '#7c3aed', fg: '#ffffff', tint: 'rgba(124,58,237,0.1)', chipBg: '#f5f3ff', chipInk: '#5b21b6' },
]

const DEFAULT_COLOR = PIN_COLORS[0]!

/* Annotations created before the redesign stored the old card swatches. Fold
   them onto the nearest new colour so existing pins keep their hue; white (the
   old "no colour") and anything unrecognised fall back to the default blue. */
const LEGACY: Record<string, PinColor['id']> = {
  '#ef4444': 'red',
  '#f8cf6b': 'amber',
  '#84dda6': 'green',
  '#2f80ff': 'blue',
}

export function pinColorOf(background: string | null | undefined): PinColor {
  const v = (background || '').trim().toLowerCase()
  const direct = PIN_COLORS.find((c) => c.hex === v)
  if (direct) return direct
  const legacy = LEGACY[v]
  return PIN_COLORS.find((c) => c.id === legacy) ?? DEFAULT_COLOR
}

/** Inline CSS variables the annotate stylesheet reads, so one set of rules
    paints every colour variant. */
export function pinVars(c: PinColor): CSSProperties {
  return {
    '--sp-pc': c.hex,
    '--sp-pfg': c.fg,
    '--sp-pt': c.tint,
    '--sp-pbg': c.chipBg,
    '--sp-pink': c.chipInk,
  } as CSSProperties
}

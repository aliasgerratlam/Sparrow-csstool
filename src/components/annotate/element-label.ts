import type { Annotation } from '@/lib/types'

/* The full, exact element address (shown on hover). */
export function elementAddress(sel: Annotation['selector']): string {
  if (!sel) return 'element'
  if (sel.id) return '#' + sel.id
  return sel.primary || sel.nthPath || sel.tag || 'element'
}

/* A short label for the target — just the leaf element (tag + id/classes),
   stripped of positional :nth-child() noise. The full path lives in the title. */
export function elementLabel(sel: Annotation['selector']): string {
  if (!sel) return 'element'
  if (sel.id) return sel.tag + '#' + sel.id
  const path = sel.primary || sel.nthPath || ''
  const leaf = path.split('>').pop()?.trim()
  const clean = (leaf || sel.tag || 'element').replace(/:nth-child\(\d+\)/g, '')
  return clean || sel.tag || 'element'
}

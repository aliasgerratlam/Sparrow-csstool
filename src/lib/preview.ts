import { resolve } from './selector-engine'
import type { Annotation } from './types'

/* ─────────────────────────────────────────────────────────────────────────
   Preview — temporary, reversible inline style changes on an annotation's
   target element (driven by ann.suggestedChanges). Snapshots and restores.
───────────────────────────────────────────────────────────────────────── */

const PROPS: Record<string, string> = {
  fontSize: 'font-size',
  fontWeight: 'font-weight',
  fontFamily: 'font-family',
  color: 'color',
  background: 'background-color',
}

interface PreviewRecord {
  el: HTMLElement
  snapshot: Record<string, string>
}

const active = new Map<string, PreviewRecord>()

export function hasChanges(ann: Annotation | null | undefined): boolean {
  const sc = (ann && ann.suggestedChanges) || {}
  return Object.keys(PROPS).some((k) => sc[k] != null && sc[k] !== '')
}

export function apply(ann: Annotation): boolean {
  const el = resolve(ann.selector) as HTMLElement | null
  if (!el || !el.isConnected) return false
  const sc = ann.suggestedChanges || {}
  const snapshot: Record<string, string> = {}
  Object.keys(PROPS).forEach((k) => {
    const v = sc[k]
    if (v != null && v !== '') {
      const css = PROPS[k] as string
      snapshot[css] = el.style.getPropertyValue(css)
      el.style.setProperty(css, v)
    }
  })
  el.classList.add('annot-previewing')
  active.set(ann.id, { el, snapshot })
  return true
}

export function revert(id: string): void {
  const rec = active.get(id)
  if (!rec) return
  Object.keys(rec.snapshot).forEach((css) => {
    const prev = rec.snapshot[css]
    if (prev) rec.el.style.setProperty(css, prev)
    else rec.el.style.removeProperty(css)
  })
  rec.el.classList.remove('annot-previewing')
  active.delete(id)
}

export function revertAll(): void {
  Array.from(active.keys()).forEach(revert)
}

export function isActive(id: string): boolean {
  return active.has(id)
}

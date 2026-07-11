import { isCustomFont } from './custom-fonts'
import { genericFallbackFor, loadGoogleFont } from './google-fonts'
import { getElementLabelParts } from './extractors'
import type { ReplacementFont } from './site-refont'

/* ─────────────────────────────────────────────────────────────────────────
   Element refont — change the font of one hand-picked element (and its
   subtree) instead of every page-wide usage of a family. Complements
   site-refont.ts: same inline-style + snapshot/restore mechanics, but scoped
   to a target the user clicked while the Fonts tool's pick mode was active.

   State is a tiny external store (same pattern as custom-fonts.ts): the
   pick-mode flag lives here so ScannerController's document-level handlers
   can read it synchronously, and the target list is subscribable from React
   via useSyncExternalStore.

   Applying writes font-family on the picked element and every element in
   its subtree — descendants often carry their own font-family rules, which
   inheritance alone wouldn't defeat. Each node keeps its own fallback tail;
   snapshots make reset exact.
───────────────────────────────────────────────────────────────────────── */

export interface ElementRefontTarget {
  id: number
  el: Element
  /** "p.intro"-style label captured at pick time. */
  label: string
  /** First family of the element's computed stack at pick time. */
  originalFamily: string
  /** Family currently overriding this element, or null if none yet. */
  family: string | null
}

export interface ElementRefontState {
  picking: boolean
  targets: ElementRefontTarget[]
}

interface Snapshot {
  el: HTMLElement | SVGElement
  prev: string
}

// Immutable snapshot object (replaced on every change) so React's
// useSyncExternalStore reference-equality check works.
let state: ElementRefontState = { picking: false, targets: [] }
const snapshots = new Map<number, Snapshot[]>() // target id → inline-style snapshots
let nextId = 1
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((fn) => fn())
}

function setState(next: ElementRefontState): void {
  state = next
  emit()
}

export function subscribeElementRefont(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getElementRefontState(): ElementRefontState {
  return state
}

// ── Pick mode ────────────────────────────────────────────────────────────────

export function startElementPick(): void {
  if (!state.picking) setState({ ...state, picking: true })
}

export function stopElementPick(): void {
  if (state.picking) setState({ ...state, picking: false })
}

/** Synchronous read for ScannerController's document-level handlers. */
export function isElementPickActive(): boolean {
  return state.picking
}

function firstFamilyOf(el: Element): string {
  const first = getComputedStyle(el).fontFamily.split(',')[0] ?? ''
  return first.trim().replace(/^["']|["']$/g, '') || 'inherit'
}

/* Register the clicked element as a refont target (ends pick mode). Picking
   an element that's already targeted just returns the existing entry. */
export function pickElement(el: Element): ElementRefontTarget {
  const existing = state.targets.find((t) => t.el === el)
  if (existing) {
    setState({ ...state, picking: false })
    return existing
  }
  const target: ElementRefontTarget = {
    id: nextId++,
    el,
    label: getElementLabelParts(el).name,
    originalFamily: firstFamilyOf(el),
    family: null,
  }
  setState({ picking: false, targets: [...state.targets, target] })
  return target
}

// ── Applying / reverting ─────────────────────────────────────────────────────

function styleOf(el: Element): CSSStyleDeclaration | null {
  const s = (el as HTMLElement).style
  return s && typeof s.setProperty === 'function' ? s : null
}

/* Apply `rf` to the target's element and its whole subtree. Mirrors
   applyRefont: webfont awaited first (custom uploads are already registered),
   re-applies revert the previous write first so tails read original stacks. */
export async function applyElementFont(id: number, rf: ReplacementFont): Promise<void> {
  const target = state.targets.find((t) => t.id === id)
  if (!target) return
  if (!isCustomFont(rf)) await loadGoogleFont(rf)
  revertSnapshots(id)

  const nodes: Element[] = [target.el, ...Array.from(target.el.querySelectorAll('*'))]
  const snaps: Snapshot[] = []
  for (const el of nodes) {
    if (!el.isConnected) continue
    const style = styleOf(el)
    if (!style) continue

    // New family first, then the node's own tail so per-node fallbacks
    // survive; nodes with no tail get the replacement's generic.
    const tail = getComputedStyle(el)
      .fontFamily.split(',')
      .slice(1)
      .map((t) => t.trim())
      .filter(Boolean)
    const value = `"${rf.family}", ${tail.length ? tail.join(', ') : genericFallbackFor(rf.category)}`

    snaps.push({ el: el as HTMLElement, prev: style.getPropertyValue('font-family') })
    // `important` so the override wins over author rules — same as site-refont.
    style.setProperty('font-family', value, 'important')
  }

  snapshots.set(id, snaps)
  setState({
    ...state,
    targets: state.targets.map((t) => (t.id === id ? { ...t, family: rf.family } : t)),
  })
}

function revertSnapshots(id: number): void {
  const snaps = snapshots.get(id)
  if (!snaps) return
  for (const { el, prev } of snaps) {
    if (prev) el.style.setProperty('font-family', prev)
    else el.style.removeProperty('font-family')
  }
  snapshots.delete(id)
}

/** Revert one target's override but keep it in the list (family → null). */
export function resetElementFont(id: number): void {
  revertSnapshots(id)
  setState({
    ...state,
    targets: state.targets.map((t) => (t.id === id ? { ...t, family: null } : t)),
  })
}

/** Revert (if applied) and drop the target from the list. */
export function removeElementTarget(id: number): void {
  revertSnapshots(id)
  setState({ ...state, targets: state.targets.filter((t) => t.id !== id) })
}

/** Revert everything and clear the list (scanner disabled). */
export function resetAllElementRefonts(): void {
  Array.from(snapshots.keys()).forEach(revertSnapshots)
  if (state.targets.length || state.picking) setState({ picking: false, targets: [] })
}

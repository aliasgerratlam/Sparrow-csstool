import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useScanner } from '@/context/scanner-context'
import { useAnnotationUI } from '@/context/annotation-ui-context'
import { useAnnotations, useRole, store } from '@/hooks/use-annotations'
import { useReplySeen } from '@/hooks/use-reply-seen'
import { useCollab } from '@/context/collab-context'
import { useElementRect } from '@/hooks/use-element-rect'
import { resolve } from '@/lib/selector-engine'
import { hasUnreadReplies } from '@/lib/reply-seen'
import { fmtDate } from '@/lib/format'
import type { Annotation } from '@/lib/types'
import { PIN_COLORS, pinColorOf, pinVars } from './pin-colors'

interface PinPos {
  left: number
  top: number
  hidden: boolean
}

const PIN = 30 // px — pin diameter in the design
const NUDGE = PIN + 4 // horizontal step when two pins would overlap

export function PinLayer() {
  const items = useAnnotations()
  const { mode, isActive } = useScanner()
  const ui = useAnnotationUI()
  const [positions, setPositions] = useState<Record<string, PinPos>>({})
  // Pin whose note bubble is showing (hover or keyboard focus).
  const [noteId, setNoteId] = useState<string | null>(null)
  const raf = useRef(0)

  const role = useRole()
  // Re-render when the reply-seen ledger changes (e.g. a card is opened) so the
  // unread dot clears. New replies re-render via `items` (useAnnotations) already.
  useReplySeen()
  const { sessionEnded } = useCollab()
  const visible =
    ((isActive && mode === 'annotate') || role === 'client') && !sessionEnded
  // Identity the current user's replies are stamped with, so our own replies
  // never light up our own pin.
  const myName = store.myDisplayName(ui.author)

  // Every annotation gets a pin: open ones numbered, resolved ones as a green
  // check. Numbering is creation-ordered (displayNumbers) so every collaborator
  // sees the same "#4".
  const pinItems: { ann: Annotation; num: number }[] = useMemo(() => {
    const numbers = store.displayNumbers(items)
    return items.map((ann, idx) => ({ ann, num: numbers.get(ann.id) ?? idx + 1 }))
  }, [items])

  const measure = useCallback(() => {
    raf.current = 0
    const placed: { left: number; top: number }[] = []
    const next: Record<string, PinPos> = {}
    pinItems.forEach(({ ann }) => {
      const el = resolve(ann.selector)
      if (!el || !el.isConnected) {
        next[ann.id] = { left: 0, top: 0, hidden: true }
        return
      }
      const r = el.getBoundingClientRect()
      let left = r.right - PIN / 2 + 3
      const top = r.top - PIN / 2 - 3
      // Anchor the pin to its element and let it scroll with the page. Only clamp
      // horizontally so it can't drift off-screen sideways; vertically it rides
      // along with the element and is simply hidden once it scrolls out of view —
      // never pinned to the top/bottom edge of the viewport.
      left = Math.max(4, Math.min(left, window.innerWidth - PIN - 6))
      if (top < 44 || top > window.innerHeight - 28) {
        next[ann.id] = { left: 0, top: 0, hidden: true }
        return
      }
      // Nudge overlapping pins apart horizontally (staying on the same row) so
      // they don't get dragged away from the element they belong to.
      let guard = 0
      while (
        placed.some(
          (p) => Math.abs(p.left - left) < NUDGE && Math.abs(p.top - top) < NUDGE,
        ) &&
        guard < 40
      ) {
        left = Math.max(4, left - NUDGE)
        guard++
      }
      placed.push({ left, top })
      next[ann.id] = { left, top, hidden: false }
    })
    setPositions(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  const schedule = useCallback(() => {
    if (raf.current) return
    raf.current = requestAnimationFrame(measure)
  }, [measure])

  useEffect(() => {
    if (!visible) return
    measure()
    window.addEventListener('scroll', schedule, { passive: true, capture: true })
    window.addEventListener('resize', schedule)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
      window.removeEventListener('scroll', schedule, { capture: true })
      window.removeEventListener('resize', schedule)
    }
  }, [visible, measure, schedule])

  if (!visible) return null

  return (
    <div id="annot-pin-layer">
      {ui.draft && <DraftTarget draft={ui.draft} number={items.length + 1} />}
      {pinItems.map(({ ann, num }) => {
        const pos = positions[ann.id]
        if (!pos || pos.hidden) return null
        const resolved = ann.status === 'Resolved'
        // Resolved pins are always the design's green check, whatever colour they
        // were dropped in.
        const color = resolved ? PIN_COLORS[3]! : pinColorOf(ann.styling?.background)
        const unread = hasUnreadReplies(ann, myName)
        const note = ann.comment || 'Annotation ' + num
        // Flip the note to the left of the pin when it would run off-screen.
        const flip = pos.left > window.innerWidth - 300
        return (
          <div
            key={ann.id}
            className="sp-pin-wrap"
            style={{ left: pos.left, top: pos.top }}
          >
            <button
              type="button"
              className={
                'annot-pin sp-pin ' +
                (resolved ? 'resolved' : 'open') +
                (ann.id === ui.activeId ? ' active' : '')
              }
              style={pinVars(color)}
              aria-label={
                (resolved ? 'Resolved pin ' : 'Pin ') + num + ': ' + note
              }
              aria-pressed={ann.id === ui.activeId}
              onClick={(e) => {
                e.stopPropagation()
                ui.openCard(ann.id)
                ui.focusAnnotation(ann)
              }}
              onMouseEnter={() => {
                ui.setHoverPinEl(resolve(ann.selector))
                setNoteId(ann.id)
              }}
              onMouseLeave={() => {
                ui.setHoverPinEl(null)
                setNoteId((id) => (id === ann.id ? null : id))
              }}
              onFocus={() => setNoteId(ann.id)}
              onBlur={() => setNoteId((id) => (id === ann.id ? null : id))}
            >
              {resolved ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12l5 5L20 7" />
                </svg>
              ) : (
                num
              )}
              {unread && <span className="annot-pin-dot" aria-hidden="true" />}
            </button>
            {noteId === ann.id && ann.id !== ui.activeId && (
              <div
                className={'sp-pin-note' + (flip ? ' flip' : '')}
                role="presentation"
              >
                <div className="sp-pin-note-meta">
                  <span className="sp-pin-note-author">
                    {ann.author || 'Unknown'}
                  </span>
                  {ann.createdAt && <span>{fmtDate(ann.createdAt)}</span>}
                </div>
                <div className="sp-pin-note-text">{note}</div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* While a new pin is being composed: a preview of the pin itself, in the chosen
   colour and with the number it will get, at the target element's corner. (The
   dashed element outline + selector tag come from the scanner overlays.) */
function DraftTarget({ draft, number }: { draft: Annotation; number: number }) {
  const el = useMemo(() => resolve(draft.selector), [draft.selector])
  const rect = useElementRect(el)
  if (!rect) return null
  const color = pinColorOf(draft.styling?.background)
  return (
    <div
      className="sp-draft-target"
      style={{
        ...pinVars(color),
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }}
      aria-hidden="true"
    >
      <span className="sp-draft-pin">{number}</span>
    </div>
  )
}

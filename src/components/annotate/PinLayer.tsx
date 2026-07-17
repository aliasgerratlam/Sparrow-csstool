import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useScanner } from '@/context/scanner-context'
import { useAnnotationUI } from '@/context/annotation-ui-context'
import { useAnnotations, useRole, store } from '@/hooks/use-annotations'
import { useReplySeen } from '@/hooks/use-reply-seen'
import { useCollab } from '@/context/collab-context'
import { resolve } from '@/lib/selector-engine'
import { hasUnreadReplies } from '@/lib/reply-seen'
import { fmtDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Annotation } from '@/lib/types'

// Dark or light pin number, whichever reads better on the tint.
function pinTextColor(hex: string): string {
  if (typeof hex !== 'string' || hex[0] !== '#' || hex.length !== 7) return '#fff'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#1f2430' : '#fff'
}

interface PinPos {
  left: number
  top: number
  hidden: boolean
}

export function PinLayer() {
  const items = useAnnotations()
  const { mode, isActive } = useScanner()
  const ui = useAnnotationUI()
  const [positions, setPositions] = useState<Record<string, PinPos>>({})
  const raf = useRef(0)

  const role = useRole()
  // Re-render when the reply-seen ledger changes (e.g. a card is opened) so the
  // unread dot clears. New replies re-render via `items` (useAnnotations) already.
  useReplySeen()
  const { sessionEnded } = useCollab()
  const visible =
    ((isActive && mode === 'annotate') || role === 'client') && !sessionEnded
  // Identity the current user's replies are stamped with — mirrors AnnotationCard,
  // so our own replies never light up our own pin.
  const myName = ui.author.trim() || (role === 'client' ? 'Client' : 'Author')

  // Open annotations only — resolved ones live in the review list. Numbering is
  // creation-ordered (displayNumbers) so every collaborator sees the same "#4".
  const openItems: { ann: Annotation; num: number }[] = useMemo(() => {
    const numbers = store.displayNumbers(items)
    return items
      .map((ann, idx) => ({ ann, num: numbers.get(ann.id) ?? idx + 1 }))
      .filter((x) => x.ann.status !== 'Resolved')
  }, [items])

  const measure = useCallback(() => {
    raf.current = 0
    const placed: { left: number; top: number }[] = []
    const next: Record<string, PinPos> = {}
    openItems.forEach(({ ann }) => {
      const el = resolve(ann.selector)
      if (!el || !el.isConnected) {
        next[ann.id] = { left: 0, top: 0, hidden: true }
        return
      }
      const r = el.getBoundingClientRect()
      let left = r.right - 12
      const top = r.top - 12
      // Anchor the pin to its element and let it scroll with the page. Only clamp
      // horizontally so it can't drift off-screen sideways; vertically it rides
      // along with the element and is simply hidden once it scrolls out of view —
      // never pinned to the top/bottom edge of the viewport.
      left = Math.max(4, Math.min(left, window.innerWidth - 32))
      if (top < 44 || top > window.innerHeight - 28) {
        next[ann.id] = { left: 0, top: 0, hidden: true }
        return
      }
      // Nudge overlapping pins apart horizontally (staying on the same row) so
      // they don't get dragged away from the element they belong to.
      let guard = 0
      while (
        placed.some((p) => Math.abs(p.left - left) < 26 && Math.abs(p.top - top) < 26) &&
        guard < 40
      ) {
        left = Math.max(4, left - 26)
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
      {openItems.map(({ ann, num }) => {
        const pos = positions[ann.id]
        if (!pos || pos.hidden) return null
        const bg = ann.styling?.background
        const tinted =
          bg && bg !== 'transparent' && bg.toLowerCase() !== '#ffffff'
            ? { background: bg, color: pinTextColor(bg) }
            : undefined
        return (
          <Tooltip key={ann.id}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className={
                  'annot-pin ' +
                  (ann.status === 'Resolved' ? 'resolved' : 'open') +
                  (ann.id === ui.activeId ? ' active' : '')
                }
                style={{ left: pos.left, top: pos.top, ...tinted }}
                onClick={(e) => {
                  e.stopPropagation()
                  ui.openCard(ann.id)
                  ui.focusAnnotation(ann)
                }}
                onMouseEnter={() => ui.setHoverPinEl(resolve(ann.selector))}
                onMouseLeave={() => ui.setHoverPinEl(null)}
              >
                {num}
                {hasUnreadReplies(ann, myName) && (
                  <span className="annot-pin-dot" aria-hidden />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" light className="max-w-[260px]">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3 text-[11px] font-semibold text-[#6b7280]">
                  <span className="truncate">{ann.author || 'Unknown'}</span>
                  {ann.createdAt && (
                    <span className="shrink-0">{fmtDate(ann.createdAt)}</span>
                  )}
                </div>
                <div className="whitespace-pre-wrap wrap-break-word text-[#1f2430]">
                  {ann.comment || 'Annotation ' + num}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

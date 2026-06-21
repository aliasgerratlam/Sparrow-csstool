import { useCallback, useEffect, useRef, useState } from 'react'
import { useScanner } from '@/context/scanner-context'
import { useAnnotationUI } from '@/context/annotation-ui-context'
import { useAnnotations } from '@/hooks/use-annotations'
import { store } from '@/hooks/use-annotations'
import { resolve } from '@/lib/selector-engine'
import { Button } from '@/components/ui/button'
import type { Annotation } from '@/lib/types'

const RING_PATH =
  'M18,0 A18,18 0 0,1 36,18 A18,18 0 0,1 18,36 H3 A3,3 0 0,1 0,33 V18 A18,18 0 0,1 18,0 Z'

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

  const visible = (isActive && mode === 'annotate') || store.getRole() === 'client'

  // Open annotations only — resolved ones live in the review list.
  const openItems: { ann: Annotation; num: number }[] = items
    .map((ann, idx) => ({ ann, num: idx + 1 }))
    .filter((x) => x.ann.status !== 'Resolved')

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
      let top = r.top - 12
      left = Math.max(4, Math.min(left, window.innerWidth - 32))
      top = Math.max(48, Math.min(top, window.innerHeight - 32))
      let guard = 0
      while (
        placed.some((p) => Math.abs(p.left - left) < 26 && Math.abs(p.top - top) < 26) &&
        guard < 60
      ) {
        top += 24
        if (top > window.innerHeight - 32) {
          top = 48
          left = Math.max(4, left - 24)
        }
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
          <Button
            key={ann.id}
            variant="ghost"
            className={
              'annot-pin ' +
              (ann.status === 'Resolved' ? 'resolved' : 'open') +
              (ann.id === ui.activeId ? ' active' : '')
            }
            title={ann.comment || 'Annotation ' + num}
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
            <svg className="annot-pin-ring" viewBox="0 0 36 36">
              <path d={RING_PATH} />
            </svg>
          </Button>
        )
      })}
    </div>
  )
}

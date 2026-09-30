import { useLayoutEffect, useRef, useState } from 'react'
import type { ColorFormat } from '@/lib/color'
import { useEntitlements, promptUpgrade } from '@/context/subscription-context'
import { useScanner } from '@/context/scanner-context'
import { useDraggable } from '@/hooks/use-draggable'
import { SiteColorOverview } from './SiteColorOverview'

// Gap from the viewport's right edge to the panel's right edge. The rail is
// ~56px wide at right:14px (spans 14–70px in), so this leaves ~22px of air
// between the panel and the rail.
const RAIL_GAP = 92
const MARGIN = 8

/* Colors tool: a whole-page color overview — every solid color the page paints
   with usage %, element counts, and a site-wide swap control (see
   SiteColorOverview / site-colors / site-recolor). It reads the page as a
   whole, so it doesn't track the hovered element or the cursor; drag it by the
   header to move it out of the way. */
export function ColorDropper() {
  // Color notation the overview values render in — HEX → RGB → HSL.
  const { colorFormat: canColorFormat } = useEntitlements()
  const { setMode } = useScanner()
  const [format, setFormat] = useState<ColorFormat>('hex')

  // Drag the panel by its header so it never sits over content you want to read.
  const panelRef = useRef<HTMLElement>(null)
  const { pos: dragPos, dragging, onHandlePointerDown } = useDraggable(panelRef)

  // Dock beside the mode rail, vertically centered in the viewport. Measured in
  // JS (once, on mount) rather than via a CSS centering transform, since the
  // panel's slide-in animation owns `transform`.
  const [dockPos, setDockPos] = useState<{ top: number; left: number } | null>(null)
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const left = Math.max(MARGIN, window.innerWidth - RAIL_GAP - panel.offsetWidth)
    const top = Math.max(MARGIN, Math.round((window.innerHeight - panel.offsetHeight) / 2))
    setDockPos({ top, left })
  }, [])

  const anchor = dragPos ?? dockPos
  const placement = anchor
    ? { top: anchor.top, left: anchor.left, right: 'auto', bottom: 'auto' }
    : undefined

  return (
    <section
      id="scanner-dropper-panel"
      aria-label="Colors on this page"
      ref={panelRef}
      className={dragging ? 'dragging' : undefined}
      style={placement}
    >
      <SiteColorOverview
        format={format}
        formatLocked={!canColorFormat}
        onFormatChange={(f) =>
          canColorFormat ? setFormat(f) : promptUpgrade('CSS color-format switching')
        }
        onClose={() => setMode('inspect')}
        // Don't start a drag when the pointer lands on a control (the drag
        // gesture would swallow its click).
        onHeadPointerDown={(e) => {
          if ((e.target as Element).closest('button, input, label')) return
          onHandlePointerDown(e)
        }}
      />
    </section>
  )
}

import { useLayoutEffect, useRef, useState } from 'react'
import { HiMiniEyeDropper } from 'react-icons/hi2'
import { GripHorizontal } from 'lucide-react'
import { nextColorFormat, type ColorFormat } from '@/lib/color'
import { useEntitlements, promptUpgrade } from '@/context/subscription-context'
import { useDraggable } from '@/hooks/use-draggable'
import { SiteColorOverview } from './SiteColorOverview'

// Gap from the viewport's right edge to the panel's right edge. The rail is
// ~56px wide at right:14px (spans 14–70px in), so this leaves ~22px of air
// between the panel and the rail.
const RAIL_GAP = 92
const MARGIN = 8

/* Colors tool: a whole-page color overview — every solid color the page paints,
   grouped into named categories with usage %, element counts, and a global edit
   control (see SiteColorOverview / site-colors / site-recolor). It reads the
   page as a whole, so it doesn't track the hovered element or the cursor; drag
   it by the header to move it out of the way. */
export function ColorDropper() {
  // Color notation the overview values render in — HEX → RGBA → HSL.
  const { colorFormat: canColorFormat } = useEntitlements()
  const [format, setFormat] = useState<ColorFormat>('hex')

  // Drag the panel by its header so it never sits over content you want to read.
  const panelRef = useRef<HTMLDivElement>(null)
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
    <div
      id="scanner-dropper-panel"
      ref={panelRef}
      className={dragging ? 'dragging' : undefined}
      style={placement}
    >
      <div
        id="dropper-head"
        // Don't start a drag when the pointer lands on the format toggle, or the
        // drag gesture swallows its click and the format never changes.
        onPointerDown={(e) => {
          if ((e.target as Element).closest('.dropper-format')) return
          onHandlePointerDown(e)
        }}
      >
        <span className="dropper-grip" aria-hidden="true" title="Drag to move">
          <GripHorizontal size={16} />
        </span>
        <span className="dropper-icon">
          <HiMiniEyeDropper size={16} />
        </span>
        <div className="dropper-head-text">
          <span className="dropper-title">Website Colors</span>
          <span className="dropper-sub">Every color used across this page</span>
        </div>
        <button
          type="button"
          className={'dropper-format' + (canColorFormat ? '' : ' locked')}
          aria-disabled={canColorFormat ? undefined : true}
          onClick={() =>
            canColorFormat
              ? setFormat(nextColorFormat)
              : promptUpgrade('CSS color-format switching')
          }
          title={
            canColorFormat
              ? 'Switch color format (HEX / RGBA / HSL)'
              : 'Upgrade to switch color format'
          }
        >
          {format.toUpperCase()}
        </button>
      </div>

      <div className="dropper-body">
        <SiteColorOverview format={format} />
      </div>
    </div>
  )
}

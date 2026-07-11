import { useLayoutEffect, useRef, useState } from 'react'
import { GripHorizontal, Type } from 'lucide-react'
import { useDraggable } from '@/hooks/use-draggable'
import { ElementFontSection } from './ElementFontSection'
import { SiteFontOverview } from './SiteFontOverview'

// Gap from the viewport's right edge to the panel's right edge. The rail is
// ~56px wide at right:14px (spans 14–70px in), so this leaves ~22px of air
// between the panel and the rail.
const RAIL_GAP = 92
const MARGIN = 8

/* Fonts tool: a whole-page typography overview — every font family the page's
   text renders in, with usage stats and a global replace control backed by the
   Google Fonts catalog (see SiteFontOverview / site-fonts / site-refont). Like
   the Colors tool it reads the page as a whole, so it doesn't track the
   hovered element or the cursor; drag it by the header to move it aside. */
export function FontPanel() {
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
      id="scanner-font-panel"
      ref={panelRef}
      className={dragging ? 'dragging' : undefined}
      style={placement}
    >
      <div className="sfont-head" onPointerDown={onHandlePointerDown}>
        <span className="sfont-grip" aria-hidden="true" title="Drag to move">
          <GripHorizontal size={16} />
        </span>
        <span className="sfont-icon">
          <Type size={16} />
        </span>
        <div className="sfont-head-text">
          <span className="sfont-title">Website Fonts</span>
          <span className="sfont-sub">Every font family used on this page</span>
        </div>
      </div>

      <div className="sfont-body">
        <ElementFontSection />
        <SiteFontOverview />
      </div>
    </div>
  )
}

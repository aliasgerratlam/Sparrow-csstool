import { useLayoutEffect, useRef, useState } from 'react'
import { Type } from 'lucide-react'
import { useDraggable } from '@/hooks/use-draggable'
import { useScanner } from '@/context/scanner-context'
import { ElementFontSection } from './ElementFontSection'
import { SiteFontOverview } from './SiteFontOverview'

// Gap from the viewport's right edge to the panel's right edge. The rail is
// ~56px wide at right:14px (spans 14–70px in), so this leaves ~22px of air
// between the panel and the rail.
const RAIL_GAP = 92
const MARGIN = 8
// Tallest the panel grows (Fonts board: 752px) before its body scrolls.
const MAX_H = 752

/* Fonts tool: a whole-page typography overview — every font family the page's
   text renders in, with usage stats and a global replace control backed by the
   Google Fonts catalog (see SiteFontOverview / site-fonts / site-refont). Like
   the Colors tool it reads the page as a whole, so it doesn't track the
   hovered element or the cursor; drag it by the header to move it aside. */
export function FontPanel() {
  const { setMode } = useScanner()
  // Drag the panel by its header so it never sits over content you want to read.
  const panelRef = useRef<HTMLElement>(null)
  const { pos: dragPos, dragging, onHandlePointerDown } = useDraggable(panelRef)

  // Dock beside the mode rail. Measured in JS (once, on mount) rather than via
  // a CSS centering transform, since the panel's slide-in animation owns
  // `transform`. The panel grows with its content up to MAX_H, so `top` is
  // computed for the tallest case — it never spills off the bottom.
  const [dockPos, setDockPos] = useState<{ top: number; left: number } | null>(null)
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const left = Math.max(MARGIN, window.innerWidth - RAIL_GAP - panel.offsetWidth)
    const maxH = Math.min(MAX_H, window.innerHeight - 2 * MARGIN)
    const top = Math.max(MARGIN, Math.round((window.innerHeight - maxH) / 2))
    setDockPos({ top, left })
  }, [])

  const anchor = dragPos ?? dockPos
  const placement = anchor
    ? { top: anchor.top, left: anchor.left, right: 'auto', bottom: 'auto' }
    : undefined

  return (
    <section
      id="scanner-font-panel"
      aria-label="Website fonts"
      ref={panelRef}
      className={dragging ? 'dragging' : undefined}
      style={placement}
    >
      <div className="sfp-head" onPointerDown={onHandlePointerDown}>
        <span className="sfp-grip" aria-hidden="true" title="Drag to move">
          <svg width="18" height="6" viewBox="0 0 18 6">
            <circle cx="3" cy="1.5" r="1.3" fill="currentColor" />
            <circle cx="9" cy="1.5" r="1.3" fill="currentColor" />
            <circle cx="15" cy="1.5" r="1.3" fill="currentColor" />
            <circle cx="3" cy="4.5" r="1.3" fill="currentColor" />
            <circle cx="9" cy="4.5" r="1.3" fill="currentColor" />
            <circle cx="15" cy="4.5" r="1.3" fill="currentColor" />
          </svg>
        </span>
        <header className="sfp-headrow">
          <span className="sfp-icon" aria-hidden="true">
            <Type size={18} />
          </span>
          <div className="sfp-head-text">
            <h2 className="sfp-title">Website fonts</h2>
            <p className="sfp-sub">Every font family used on this page</p>
          </div>
          <button
            type="button"
            className="sfp-close"
            aria-label="Close fonts"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setMode('inspect')}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
      </div>

      <div className="sfp-body">
        <ElementFontSection />
        <SiteFontOverview />
      </div>
    </section>
  )
}

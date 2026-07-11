import { useEffect, useRef, useState } from 'react'
import { useScanner } from '@/context/scanner-context'
import { useCollab } from '@/context/collab-context'
import { useRole } from '@/hooks/use-annotations'

/* Live peer cursors. A click-through overlay: cursor positions are broadcast as
   PAGE coordinates (client + scroll), so peers at different scroll offsets or
   window sizes see the cursor over the same content. The layer is
   viewport-anchored (position:fixed) and we subtract the local scroll offset at
   render time — an absolutely-positioned, document-anchored layer would break in
   the browser extension, where the app lives inside a fixed, zero-size shadow
   host that hijacks the containing block (cursors would then ignore page scroll).
   Outbound, a throttled mousemove broadcasts our pointer; inbound, we render
   every other peer's cursor. */

const SEND_INTERVAL = 45 // ms between cursor broadcasts

export function CursorLayer() {
  const { mode, isActive } = useScanner()
  const { enabled, remoteCursors, sendCursor, sessionEnded } = useCollab()
  const role = useRole()
  const lastSent = useRef(0)
  // Local scroll offset, tracked so peer cursors follow content while WE scroll —
  // not only when a peer moves and re-broadcasts (they may sit idle).
  const [scroll, setScroll] = useState({ x: 0, y: 0 })

  const active =
    enabled &&
    !sessionEnded &&
    ((isActive && mode === 'annotate') || role === 'client')

  useEffect(() => {
    if (!active) return
    const onMove = (e: MouseEvent) => {
      const now = Date.now()
      if (now - lastSent.current < SEND_INTERVAL) return
      lastSent.current = now
      sendCursor(e.clientX + window.scrollX, e.clientY + window.scrollY)
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [active, sendCursor])

  // Keep the scroll offset in sync (rAF-coalesced) so page→viewport conversion
  // stays accurate as the local user scrolls or resizes.
  useEffect(() => {
    if (!active) return
    let raf = 0
    const sync = () => {
      raf = 0
      setScroll({ x: window.scrollX, y: window.scrollY })
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(sync)
    }
    sync()
    window.addEventListener('scroll', schedule, { passive: true, capture: true })
    window.addEventListener('resize', schedule)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('scroll', schedule, { capture: true })
      window.removeEventListener('resize', schedule)
    }
  }, [active])

  if (!active || remoteCursors.length === 0) return null

  return (
    <div id="collab-cursor-layer">
      {remoteCursors.map((c) => (
        <div
          key={c.id}
          className="collab-cursor"
          style={{
            transform: `translate(${c.x - scroll.x}px, ${c.y - scroll.y}px)`,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M3 2l13 6.5-5.6 1.6L8 16 3 2z"
              fill={c.color}
              stroke="#fff"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
          <span className="collab-cursor-label" style={{ background: c.color }}>
            {c.name}
          </span>
        </div>
      ))}
    </div>
  )
}

import { type CSSProperties } from 'react'
import { useElementRect } from '@/hooks/use-element-rect'
import { getElementLabelParts, measurePair } from '@/lib/extractors'

const TICK = 12 // px length of the end caps on each measurement line
const LABEL_MARGIN = 10 // keep labels this far inside the viewport edges

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

interface Seg {
  key: string
  className: string
  style: CSSProperties
}

/* Push a measured line (h or v) plus its two perpendicular end caps. Stable
   `keyPrefix` lets React keep the same DOM nodes across renders so the CSS
   transitions animate them between elements instead of snapping. */
function pushLine(
  segs: Seg[],
  keyPrefix: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const horizontal = Math.abs(y1 - y2) < 0.5
  if (horizontal) {
    const left = Math.min(x1, x2)
    const width = Math.abs(x2 - x1)
    segs.push({ key: `${keyPrefix}-l`, className: 'ruler-line ruler-line-h', style: { top: y1, left, width } })
    segs.push({ key: `${keyPrefix}-a`, className: 'ruler-line ruler-line-v ruler-tick', style: { top: y1 - TICK / 2, left: x1, height: TICK } })
    segs.push({ key: `${keyPrefix}-b`, className: 'ruler-line ruler-line-v ruler-tick', style: { top: y1 - TICK / 2, left: x2, height: TICK } })
  } else {
    const top = Math.min(y1, y2)
    const height = Math.abs(y2 - y1)
    segs.push({ key: `${keyPrefix}-l`, className: 'ruler-line ruler-line-v', style: { left: x1, top, height } })
    segs.push({ key: `${keyPrefix}-a`, className: 'ruler-line ruler-line-h ruler-tick', style: { left: x1 - TICK / 2, top: y1, width: TICK } })
    segs.push({ key: `${keyPrefix}-b`, className: 'ruler-line ruler-line-h ruler-tick', style: { left: x1 - TICK / 2, top: y2, width: TICK } })
  }
}

/* Ruler overlay — click an element to anchor it, then hover any other element
   (text, heading, image, box) to measure the spacing between the two. Before an
   anchor is picked, hovering just highlights what you're about to anchor. The
   anchor projects dashed guidelines across the viewport for alignment checks. */
export function RulerOverlay({
  anchor,
  hovered,
}: {
  anchor: Element | null
  hovered: Element | null
}) {
  const anchorRect = useElementRect(anchor)
  const hoverRect = useElementRect(hovered)

  // Selector label (tag#id/.class) for the element under the cursor, so you can
  // tell *what* you're measuring to — the anchor stays unlabeled by design.
  const targetLabel = hovered ? getElementLabelParts(hovered).name : null

  // Pre-anchor state: just highlight + guide the element under the cursor.
  if (!anchor || !anchorRect) {
    if (!hovered || !hoverRect || (hoverRect.width === 0 && hoverRect.height === 0))
      return null
    return (
      <div id="ruler-overlay">
        <div className="scanner-guide guide-h" style={{ top: hoverRect.top }} />
        <div className="scanner-guide guide-h" style={{ top: hoverRect.bottom }} />
        <div className="scanner-guide guide-v" style={{ left: hoverRect.left }} />
        <div className="scanner-guide guide-v" style={{ left: hoverRect.right }} />
        <div
          className="ruler-box ruler-box-target"
          style={{ top: hoverRect.top, left: hoverRect.left, width: hoverRect.width, height: hoverRect.height }}
        >
          {targetLabel && (
            <span className="ruler-box-label">
              <span className="scanner-label-name">{targetLabel}</span>
            </span>
          )}
        </div>
      </div>
    )
  }

  const segs: Seg[] = []
  const labels: { key: string; style: CSSProperties; text: string }[] = []

  // Measure to the hovered target (only when it's a different element).
  const measuring = hovered && hovered !== anchor && hoverRect
  if (measuring) {
    for (const [i, gap] of measurePair(anchorRect, hoverRect).entries()) {
      if (gap.distance <= 0) continue
      pushLine(segs, `gap-${i}`, gap.line.x1, gap.line.y1, gap.line.x2, gap.line.y2)

      const horizontal = Math.abs(gap.line.y1 - gap.line.y2) < 0.5
      const vw = window.innerWidth
      const vh = window.innerHeight
      // Anchor the label to the midpoint of the line's *visible* span rather than
      // its geometric midpoint, then clamp inside the viewport. When the target is
      // far from the anchor one end of the line can sit off-screen, which would
      // otherwise push the label out of view entirely.
      let style: CSSProperties
      if (horizontal) {
        const loX = Math.max(Math.min(gap.line.x1, gap.line.x2), LABEL_MARGIN)
        const hiX = Math.min(Math.max(gap.line.x1, gap.line.x2), vw - LABEL_MARGIN)
        const cx = clamp((loX + hiX) / 2, LABEL_MARGIN, vw - LABEL_MARGIN)
        // Sit above the line, but drop below it when there's no room up top.
        const above = gap.line.y1 - 8 > LABEL_MARGIN + 20
        const cy = clamp(gap.line.y1, LABEL_MARGIN, vh - LABEL_MARGIN)
        style = above
          ? { left: cx, top: cy - 8, transform: 'translate(-50%, -100%)' }
          : { left: cx, top: cy + 8, transform: 'translate(-50%, 0)' }
      } else {
        const loY = Math.max(Math.min(gap.line.y1, gap.line.y2), LABEL_MARGIN)
        const hiY = Math.min(Math.max(gap.line.y1, gap.line.y2), vh - LABEL_MARGIN)
        const cy = clamp((loY + hiY) / 2, LABEL_MARGIN, vh - LABEL_MARGIN)
        // Sit beside the line, flipping to its left when hugging the right edge so
        // the pill (which grows rightward) doesn't get clipped by the viewport.
        const beside = gap.line.x1 > vw - 120
        const cx = clamp(beside ? gap.line.x1 - 8 : gap.line.x1 + 8, LABEL_MARGIN, vw - LABEL_MARGIN)
        style = beside
          ? { left: cx, top: cy, transform: 'translate(-100%, -50%)' }
          : { left: cx, top: cy, transform: 'translateY(-50%)' }
      }
      labels.push({ key: `gap-${i}`, style, text: `${gap.distance} px` })
    }
  }

  return (
    <div id="ruler-overlay">
      {/* Anchor's guidelines projected across the viewport */}
      <div className="scanner-guide guide-h" style={{ top: anchorRect.top }} />
      <div className="scanner-guide guide-h" style={{ top: anchorRect.bottom }} />
      <div className="scanner-guide guide-v" style={{ left: anchorRect.left }} />
      <div className="scanner-guide guide-v" style={{ left: anchorRect.right }} />

      {/* Anchor highlight (the element we measure from) */}
      <div
        className="ruler-box ruler-box-anchor"
        style={{ top: anchorRect.top, left: anchorRect.left, width: anchorRect.width, height: anchorRect.height }}
      />

      {/* Target highlight + measurement lines/labels */}
      {measuring && (
        <div
          className="ruler-box ruler-box-target"
          style={{ top: hoverRect!.top, left: hoverRect!.left, width: hoverRect!.width, height: hoverRect!.height }}
        >
          {targetLabel && (
            <span className="ruler-box-label">
              <span className="scanner-label-name">{targetLabel}</span>
            </span>
          )}
        </div>
      )}
      {segs.map((s) => (
        <div key={s.key} className={s.className} style={s.style} />
      ))}
      {labels.map((l) => (
        <div key={l.key} className="ruler-label" style={l.style}>
          <span className="scanner-label-name">{l.text}</span>
        </div>
      ))}
    </div>
  )
}

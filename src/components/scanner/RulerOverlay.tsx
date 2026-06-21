import { type CSSProperties } from 'react'
import { useElementRect } from '@/hooks/use-element-rect'
import { measurePair } from '@/lib/extractors'

const TICK = 12 // px length of the end caps on each measurement line

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
        />
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

      const midX = (gap.line.x1 + gap.line.x2) / 2
      const midY = (gap.line.y1 + gap.line.y2) / 2
      const horizontal = Math.abs(gap.line.y1 - gap.line.y2) < 0.5
      // Keep the label clear of the line so it reads at a glance: sit it above a
      // horizontal line, and just beside a vertical one.
      const style: CSSProperties = horizontal
        ? { left: midX, top: midY - 8, transform: 'translate(-50%, -100%)' }
        : { left: midX + 8, top: midY, transform: 'translateY(-50%)' }
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
        />
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

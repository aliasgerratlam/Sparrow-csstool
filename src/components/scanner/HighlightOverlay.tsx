import { useElementRect } from '@/hooks/use-element-rect'
import { getElementLabelParts } from '@/lib/extractors'

/* Hover highlight box + dashed alignment guides projecting from its edges. */
export function HighlightOverlay({ target }: { target: Element | null }) {
  const rect = useElementRect(target)
  if (!target || !rect || (rect.width === 0 && rect.height === 0)) return null

  const { name, dims } = getElementLabelParts(target)

  return (
    <>
      <div
        id="scanner-highlight"
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        }}
      >
        <div id="scanner-highlight-label">
          <span className="scanner-label-name">{name}</span>
          <span className="scanner-label-dims">{dims}</span>
        </div>
      </div>
      <div id="scanner-guides">
        <div className="scanner-guide guide-h" style={{ top: rect.top }} />
        <div className="scanner-guide guide-h" style={{ top: rect.bottom }} />
        <div className="scanner-guide guide-v" style={{ left: rect.left }} />
        <div className="scanner-guide guide-v" style={{ left: rect.right }} />
      </div>
    </>
  )
}

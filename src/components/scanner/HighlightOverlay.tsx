import { useElementRect } from '@/hooks/use-element-rect'
import { getElementLabelParts } from '@/lib/extractors'

/* Hover highlight box + dashed alignment guides projecting from its edges.
   `guides` toggles the projected alignment lines (off in annotate mode, where
   only the border box is wanted). `relink` tints everything red to signal the
   next click will re-point an orphaned annotation. */
export function HighlightOverlay({
  target,
  guides = true,
  solid = false,
  relink = false,
}: {
  target: Element | null
  guides?: boolean
  solid?: boolean
  relink?: boolean
}) {
  const rect = useElementRect(target)
  if (!target || !rect || (rect.width === 0 && rect.height === 0)) return null

  const { name, dims } = getElementLabelParts(target)

  return (
    <>
      <div
        id="scanner-highlight"
        className={[relink ? 'relink' : '', solid ? 'solid' : ''].join(' ').trim() || undefined}
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
      {guides && (
        <div id="scanner-guides" className={relink ? 'relink' : undefined}>
          <div className="scanner-guide guide-h" style={{ top: rect.top }} />
          <div className="scanner-guide guide-h" style={{ top: rect.bottom }} />
          <div className="scanner-guide guide-v" style={{ left: rect.left }} />
          <div className="scanner-guide guide-v" style={{ left: rect.right }} />
        </div>
      )}
    </>
  )
}

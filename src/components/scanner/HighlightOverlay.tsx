import { useElementRect } from '@/hooks/use-element-rect'
import { getElementLabelParts } from '@/lib/extractors'
import {
  GuideLines,
  MarginGuide,
  PaddingBox,
  fitsBelow,
  useBoxMetrics,
} from './ElementMarks'

/* Hover highlight box + dashed alignment guides projecting from its edges.
   `guides` toggles the projected alignment lines (off in annotate mode, where
   only a dashed outline is wanted). `relink` tints everything red to signal the
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
  const metrics = useBoxMetrics(target, rect?.width, rect?.height)
  if (!target || !rect || (rect.width === 0 && rect.height === 0)) return null

  const { name, dims } = getElementLabelParts(target)
  // Inspect labels sit under the box; annotate labels sit above it (like the
  // pin chip). Either flips to the other side when the viewport edge is in the way.
  const preferAbove = !guides
  const above = preferAbove ? rect.top >= 34 : !fitsBelow(rect)

  const classes = [
    relink && 'relink',
    solid && 'solid',
    !guides && 'is-annotate',
    above ? 'label-above' : 'label-below',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <div
        id="scanner-highlight"
        className={classes}
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          borderRadius: metrics?.radius,
        }}
      >
        {guides && <PaddingBox inset={metrics?.inset ?? null} />}
        <div id="scanner-highlight-label">
          <span className="scanner-label-name">{name}</span>
          <span className="scanner-label-dims">{dims}</span>
        </div>
      </div>
      {guides && (
        <div id="scanner-guides" className={relink ? 'relink' : undefined}>
          <GuideLines rect={rect} />
          {!relink && metrics && (
            <MarginGuide rect={rect} marginTop={metrics.marginTop} />
          )}
        </div>
      )}
    </>
  )
}

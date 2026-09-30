import { useElementRect } from '@/hooks/use-element-rect'
import { getElementLabelParts } from '@/lib/extractors'
import {
  GuideLines,
  MarginGuide,
  PaddingBox,
  fitsBelow,
  useBoxMetrics,
} from './ElementMarks'

/* Frozen (pinned) selection — drawn exactly like the live hover highlight so
   freezing doesn't change the picture — and, unpinned, briefly used to flash a
   focused annotation target (a dashed outline like the annotate highlight). */
export function SelectedOverlay({
  target,
  pinned,
}: {
  target: Element | null
  pinned: boolean
}) {
  const rect = useElementRect(target)
  const metrics = useBoxMetrics(target, rect?.width, rect?.height)
  if (!target || !rect) return null

  const { name, dims } = getElementLabelParts(target)
  const above = pinned ? !fitsBelow(rect) : rect.top >= 34

  return (
    <>
      <div
        id="scanner-selected"
        className={[pinned ? 'is-pinned' : 'is-flash', above ? 'label-above' : 'label-below'].join(' ')}
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          borderRadius: metrics?.radius,
        }}
      >
        {pinned && <PaddingBox inset={metrics?.inset ?? null} />}
        <div id="scanner-selected-label">
          <span className="scanner-label-name">{name}</span>
          {pinned && <span className="scanner-label-dims">{dims}</span>}
        </div>
      </div>
      {pinned && (
        <div id="scanner-selected-guides">
          <GuideLines rect={rect} />
          {metrics && <MarginGuide rect={rect} marginTop={metrics.marginTop} />}
        </div>
      )}
    </>
  )
}

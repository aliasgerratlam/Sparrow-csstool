import { useElementRect } from '@/hooks/use-element-rect'
import { getElementLabel } from '@/lib/extractors'

/* Pinned (frozen) highlight, also reused to briefly flash a focused element. */
export function SelectedOverlay({
  target,
  pinned,
}: {
  target: Element | null
  pinned: boolean
}) {
  const rect = useElementRect(target)
  if (!target || !rect) return null

  return (
    <div
      id="scanner-selected"
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      }}
    >
      <div id="scanner-selected-label">
        {(pinned ? '📌 ' : '') + getElementLabel(target)}
      </div>
    </div>
  )
}

import { useSyncExternalStore } from 'react'
import { useScanner } from '@/context/scanner-context'
import { useAnnotationUI } from '@/context/annotation-ui-context'
import { getElementRefontState, subscribeElementRefont } from '@/lib/element-refont'
import { HighlightOverlay } from './HighlightOverlay'
import { SelectedOverlay } from './SelectedOverlay'
import { RulerOverlay } from './RulerOverlay'

/* Hover/selected/flash overlays. Rendered at app level so pin-hover and
   focus-flash also work in client review mode (scanner inactive). */
export function Overlays() {
  const { isActive, frozen, mode, hoveredEl, selectedEl } = useScanner()
  const { hoverPinEl, flashEl, relinkId } = useAnnotationUI()
  const { picking } = useSyncExternalStore(subscribeElementRefont, getElementRefontState)

  const rulerActive = isActive && mode === 'ruler'
  // Ruler replaces the hover/selected boxes with its own overlay. Dropper
  // (Colors), Fonts and Assets are whole-page overviews and don't inspect a
  // single element — except while the Fonts tool's "select text" pick mode is
  // armed, which highlights the hovered element exactly like inspect.
  const noInspectOverlay =
    rulerActive ||
    mode === 'dropper' ||
    mode === 'assets' ||
    (mode === 'fonts' && !picking)
  const highlightTarget =
    hoverPinEl ?? (isActive && !frozen && !noInspectOverlay ? hoveredEl : null)
  const selectedTarget = frozen && !noInspectOverlay ? selectedEl : flashEl
  // Annotate shows only the border box (no projected alignment guides).
  const showGuides = mode !== 'annotate'
  const solidBorder = false
  // Re-linking an orphaned annotation: tint the hover highlight red.
  const relinking = !!relinkId

  return (
    <>
      <HighlightOverlay
        target={highlightTarget}
        guides={showGuides}
        solid={solidBorder}
        relink={relinking}
      />
      <SelectedOverlay target={selectedTarget} pinned={frozen} />
      {rulerActive && <RulerOverlay anchor={selectedEl} hovered={hoveredEl} />}
    </>
  )
}

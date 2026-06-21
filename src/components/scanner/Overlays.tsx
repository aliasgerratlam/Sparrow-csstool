import { useScanner } from '@/context/scanner-context'
import { useAnnotationUI } from '@/context/annotation-ui-context'
import { HighlightOverlay } from './HighlightOverlay'
import { SelectedOverlay } from './SelectedOverlay'
import { RulerOverlay } from './RulerOverlay'

/* Hover/selected/flash overlays. Rendered at app level so pin-hover and
   focus-flash also work in client review mode (scanner inactive). */
export function Overlays() {
  const { isActive, frozen, mode, hoveredEl, selectedEl } = useScanner()
  const { hoverPinEl, flashEl } = useAnnotationUI()

  const rulerActive = isActive && mode === 'ruler'
  // In ruler mode the inspect hover/selected boxes are replaced by the ruler
  // overlay; in dropper mode the loupe replaces them entirely, so neither the
  // dashed highlight nor the guides should render.
  const dropperActive = isActive && mode === 'dropper'
  const noInspectOverlay = rulerActive || dropperActive
  const highlightTarget =
    hoverPinEl ?? (isActive && !frozen && !noInspectOverlay ? hoveredEl : null)
  const selectedTarget = frozen && !noInspectOverlay ? selectedEl : flashEl

  return (
    <>
      <HighlightOverlay target={highlightTarget} />
      <SelectedOverlay target={selectedTarget} pinned={frozen} />
      {rulerActive && <RulerOverlay anchor={selectedEl} hovered={hoveredEl} />}
    </>
  )
}

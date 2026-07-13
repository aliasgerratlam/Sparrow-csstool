import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useScanner } from '@/context/scanner-context'
import { useEntitlements, promptUpgrade } from '@/context/subscription-context'
import { useDraggable } from '@/hooks/use-draggable'
import { useElementRect } from '@/hooks/use-element-rect'
import { useCssInspection, viewHasColors } from '@/hooks/use-css-inspection'
import { buildCSSText, getDimensions } from '@/lib/extractors'
import { getTailwindClasses } from '@/lib/tailwind'
import { detectFramework } from '@/lib/framework-detect'
import { copyToClipboard } from '@/lib/clipboard'
import { PiCursorLight } from 'react-icons/pi'
import { IoCopyOutline, IoLockClosed } from 'react-icons/io5'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ColorFormatContext } from '@/context/color-format'
import { nextColorFormat, type ColorFormat } from '@/lib/color'
import { Breadcrumb } from './Breadcrumb'
import { CssRulesView } from './CssRulesView'
import { HierarchyTip } from './HierarchyTip'

const GAP = 12
const MARGIN = 8
const TOOLBAR_H = 44
const RAIL_MARGIN = 64

export function InspectorPanel() {
  const { panelEl, mode, frozen, disable } = useScanner()

  const panelRef = useRef<HTMLDivElement>(null)
  const {
    pos: dragPos,
    dragging,
    onHandlePointerDown,
    resetPosition,
  } = useDraggable(panelRef)
  const [followPos, setFollowPos] = useState<{ top: number; left: number } | null>(
    null,
  )
  const [hierAnchor, setHierAnchor] = useState<DOMRect | null>(null)

  const elRect = useElementRect(panelEl)

  // A drag position belongs to the element it was dragged next to — freezing a
  // DIFFERENT element must re-dock the panel beside it, not keep the old spot.
  useEffect(() => {
    resetPosition()
  }, [panelEl, resetPosition])

  // Float the panel beside the inspected element (unless dragged while frozen).
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel || !elRect) {
      setFollowPos(null)
      return
    }
    const pw = panel.offsetWidth
    const ph = panel.offsetHeight
    let left = elRect.right + GAP
    if (left + pw > window.innerWidth - RAIL_MARGIN) {
      left = elRect.left - GAP - pw
      if (left < MARGIN)
        left = Math.max(MARGIN, window.innerWidth - pw - RAIL_MARGIN)
    }
    let top = elRect.top
    top = Math.max(TOOLBAR_H + MARGIN, Math.min(top, window.innerHeight - ph - MARGIN))
    setFollowPos({ top, left })
  }, [elRect, mode])

  const usingDrag = frozen && dragPos != null
  const placement = usingDrag
    ? { top: dragPos.top, left: dragPos.left, right: 'auto', bottom: 'auto' }
    : followPos
      ? { top: followPos.top, left: followPos.left, right: 'auto', bottom: 'auto' }
      : undefined

  // Summary: dimensions + the font the element actually uses.
  const summary = useMemo(() => {
    if (!panelEl) return null
    const dims = getDimensions(panelEl)
    const cs = window.getComputedStyle(panelEl)
    const family = (cs.fontFamily || '').split(',')[0]?.replace(/['"]/g, '').trim()
    return { dims: `${dims.width} x ${dims.height}`, family, fullFamily: cs.fontFamily, size: cs.fontSize }
  }, [panelEl])

  // Copy action — Tailwind class list or serialized CSS, depending on element.
  const twClasses = useMemo(
    () =>
      panelEl && detectFramework() === 'tailwind'
        ? getTailwindClasses(panelEl)
        : [],
    [panelEl],
  )
  // The matched-rules view model, computed here so the color-format toggle can
  // be shown only when the rules actually contain convertible colors.
  const vm = useCssInspection(panelEl)
  const hasColors = useMemo(() => viewHasColors(vm), [vm])

  // Color notation the CSS rules render in — one button cycles HEX → RGBA → HSL.
  // The toggle is a paid feature (locked on Free): the view stays pinned to HEX.
  const { colorFormat: canColorFormat } = useEntitlements()
  const [colorFormat, setColorFormat] = useState<ColorFormat>('hex')
  const [copied, setCopied] = useState(false)
  const onCopy = useCallback(() => {
    if (!panelEl) return
    const text = twClasses.length ? twClasses.join(' ') : buildCSSText(panelEl)
    void copyToClipboard(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [panelEl, twClasses])

  // The hierarchy tip is anchored under the header but rendered as a sibling, so
  // moving the pointer from the header into the tip would immediately fire the
  // header's mouseleave and close it before you could reach it. Defer the hide
  // and let either the header or the tip itself cancel it — so you can move into
  // the block to read/scroll it.
  const hideTimer = useRef<number | null>(null)
  const cancelHide = useCallback(() => {
    if (hideTimer.current !== null) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }, [])
  const scheduleHide = useCallback(() => {
    cancelHide()
    hideTimer.current = window.setTimeout(() => setHierAnchor(null), 160)
  }, [cancelHide])
  useEffect(() => cancelHide, [cancelHide])

  const onHeaderEnter = useCallback(() => {
    if (dragging) return
    cancelHide()
    const header = panelRef.current?.querySelector('#panel-header')
    if (header) setHierAnchor(header.getBoundingClientRect())
  }, [dragging, cancelHide])
  const onHeaderLeave = useCallback(() => scheduleHide(), [scheduleHide])

  // In annotate mode the floating panel is suppressed — its controls (name,
  // Review, Share) already live in the toolbar, and clicking an element opens
  // the AnnotationCard at the bottom instead.
  if (mode !== 'inspect') return null

  return (
    <>
      <div
        id="scanner-panel"
        ref={panelRef}
        // While live-hovering (not frozen) the panel is click-through so it never
        // blocks the element underneath it — letting you reach corner/edge
        // elements the floating panel would otherwise sit on top of. Clicking to
        // freeze makes it interactive again (copy, drag, etc.).
        className={
          [dragging && 'dragging', !frozen && 'live'].filter(Boolean).join(' ') ||
          undefined
        }
        style={placement}
      >
        <div
          id="panel-header"
          onPointerDown={(e) => {
            if ((e.target as Element).closest('#panel-close-btn')) return
            setHierAnchor(null)
            onHandlePointerDown(e)
          }}
          onMouseEnter={onHeaderEnter}
          onMouseLeave={onHeaderLeave}
        >
          <span className="panel-logo" aria-hidden="true">
            <PiCursorLight />
          </span>
          <Breadcrumb element={panelEl} />
          <Button
            id="panel-close-btn"
            variant="ghost"
            title="Close scanner"
            onClick={(e) => {
              e.stopPropagation()
              disable()
            }}
          >
            ✕
          </Button>
        </div>

        {summary && (
          <div id="panel-summary">
            <div className="sum-group">
              <span className="sum-label">Dimensions</span>
              <span id="panel-dims">{summary.dims}</span>
            </div>
            <div className="sum-group">
              <span className="sum-label">Typography</span>
              <span id="panel-font">
                {summary.family ? (
                  <>
                    <span className="font-chip" title={summary.fullFamily}>
                      {summary.family}
                    </span>
                    <span className="font-size">{summary.size}</span>
                  </>
                ) : (
                  '—'
                )}
              </span>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" className="sum-action">
                  ✎
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                Edit feature will be available in a future update
              </TooltipContent>
            </Tooltip>
          </div>
        )}
        <div id="panel-content">
          <section className="insp-section">
            <div className="css-rules-head">
              <span className="css-rules-label">CSS Rules</span>
              {hasColors &&
                (canColorFormat ? (
                <Button
                  variant="ghost"
                  className="btn-color-format"
                  onClick={() => setColorFormat(nextColorFormat)}
                  title="Switch color format (HEX / RGBA / HSL)"
                >
                  {colorFormat.toUpperCase()}
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      className="btn-color-format locked"
                      aria-disabled
                      onClick={() => promptUpgrade('CSS color-format switching')}
                    >
                      <IoLockClosed className="btn-color-format-lock" />
                      {colorFormat.toUpperCase()}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    That feature is not available in the free plan
                  </TooltipContent>
                </Tooltip>
                ))}
              <Button
                variant="ghost"
                className={'btn-copy-css' + (copied ? ' copied' : '')}
                onClick={onCopy}
                title={
                  twClasses.length ? 'Copy Tailwind classes' : 'Copy matched CSS'
                }
              >
                {copied ? (
                  '✓ Copied!'
                ) : (
                  <>
                    <IoCopyOutline />
                    {twClasses.length ? 'Copy Tailwind Classes' : 'Copy CSS'}
                  </>
                )}
              </Button>
            </div>
            <div id="pane-css-rules">
              <ColorFormatContext.Provider value={colorFormat}>
                <CssRulesView vm={vm} />
              </ColorFormatContext.Provider>
            </div>
          </section>
        </div>
      </div>

      <HierarchyTip
        element={panelEl}
        anchorRect={hierAnchor}
        onMouseEnter={cancelHide}
        onMouseLeave={scheduleHide}
      />
    </>
  )
}

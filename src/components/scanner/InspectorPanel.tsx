import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { useScanner } from '@/context/scanner-context'
import { useEntitlements, promptUpgrade } from '@/context/subscription-context'
import { useDraggable } from '@/hooks/use-draggable'
import { useElementRect } from '@/hooks/use-element-rect'
import { useCssInspection } from '@/hooks/use-css-inspection'
import {
  buildCSSText,
  getDimensions,
  getElementLabelParts,
} from '@/lib/extractors'
import { getTailwindClasses } from '@/lib/tailwind'
import { detectFramework } from '@/lib/framework-detect'
import { copyToClipboard } from '@/lib/clipboard'
import { IoLockClosed } from 'react-icons/io5'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ColorFormatContext } from '@/context/color-format'
import {
  convertColorTokens,
  parseCssColor,
  type ColorFormat,
} from '@/lib/color'
import { Breadcrumb } from './Breadcrumb'
import { CssRulesView, type InspectTab } from './CssRulesView'
import { HierarchyTip } from './HierarchyTip'

const GAP = 12
const MARGIN = 8
const TOOLBAR_H = 44
const RAIL_MARGIN = 64
const BOTTOM_RESERVE = 76 // keep clear of the bottom session bar

const FORMATS: { id: ColorFormat; label: string }[] = [
  { id: 'hex', label: 'HEX' },
  { id: 'rgba', label: 'RGB' },
  { id: 'hsl', label: 'HSL' },
]

const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

/* A color readout: swatch + value in the current notation. */
function ColorValue({
  raw,
  format,
}: {
  raw: string
  format: ColorFormat
}) {
  const rgba = parseCssColor(raw)
  const transparent = !!rgba && rgba[3] === 0
  return (
    <div className="sp-ip-card-color">
      <span
        className={'sp-ip-dot' + (transparent ? ' is-none' : '')}
        style={transparent ? undefined : { background: raw }}
      />
      <span className="sp-ip-card-val" title={transparent ? 'transparent' : raw}>
        {transparent ? 'transparent' : convertColorTokens(raw, format)}
      </span>
    </div>
  )
}

export function InspectorPanel() {
  const { panelEl, mode, frozen, disable, freeze, unfreeze } = useScanner()

  const panelRef = useRef<HTMLElement>(null)
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
    top = Math.max(TOOLBAR_H + MARGIN, Math.min(top, window.innerHeight - ph - BOTTOM_RESERVE))
    setFollowPos({ top, left })
  }, [elRect, mode])

  const usingDrag = frozen && dragPos != null
  const placement = usingDrag
    ? { top: dragPos.top, left: dragPos.left, right: 'auto', bottom: 'auto' }
    : followPos
      ? { top: followPos.top, left: followPos.left, right: 'auto', bottom: 'auto' }
      : undefined

  // Readout: dimensions, the font the element actually uses, and its fill/text
  // colors — all straight from computed style.
  const summary = useMemo(() => {
    if (!panelEl) return null
    const dims = getDimensions(panelEl)
    const cs = window.getComputedStyle(panelEl)
    const family = (cs.fontFamily || '').split(',')[0]?.replace(/['"]/g, '').trim()
    const size = parseFloat(cs.fontSize)
    return {
      width: dims.width,
      height: dims.height,
      name: getElementLabelParts(panelEl).name,
      family,
      fullFamily: cs.fontFamily,
      size: Number.isFinite(size) ? String(Math.round(size * 10) / 10) : cs.fontSize,
      weight: cs.fontWeight,
      fill: cs.backgroundColor,
      text: cs.color,
    }
  }, [panelEl])

  // Copy action — Tailwind class list or serialized CSS, depending on the tab.
  const twClasses = useMemo(
    () =>
      panelEl && detectFramework() === 'tailwind'
        ? getTailwindClasses(panelEl)
        : [],
    [panelEl],
  )
  // The matched-rules view model (Tailwind chips + CSS rows).
  const vm = useCssInspection(panelEl)
  const hasTailwind = !!vm?.tailwind
  const [tabChoice, setTabChoice] = useState<InspectTab>('tw')
  const tab: InspectTab = hasTailwind ? tabChoice : 'css'

  // Color notation the CSS rows + readout render in. The toggle is a paid
  // feature (locked on Free): the view stays pinned to HEX.
  const { colorFormat: canColorFormat } = useEntitlements()
  const [colorFormat, setColorFormat] = useState<ColorFormat>('hex')

  const [copiedFoot, setCopiedFoot] = useState(false)
  const [copiedBox, setCopiedBox] = useState(false)
  const footTimer = useRef<number | null>(null)
  const boxTimer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (footTimer.current !== null) clearTimeout(footTimer.current)
      if (boxTimer.current !== null) clearTimeout(boxTimer.current)
    },
    [],
  )

  const copyText = useCallback(
    (which: 'foot' | 'box') => {
      if (!panelEl) return
      const text =
        which === 'foot' && tab === 'tw' && twClasses.length
          ? twClasses.join(' ')
          : buildCSSText(panelEl)
      void copyToClipboard(text).then((ok) => {
        if (!ok) return
        const [set, timer] =
          which === 'foot'
            ? ([setCopiedFoot, footTimer] as const)
            : ([setCopiedBox, boxTimer] as const)
        set(true)
        if (timer.current !== null) clearTimeout(timer.current)
        timer.current = window.setTimeout(() => set(false), 1600)
      })
    },
    [panelEl, tab, twClasses],
  )
  const onCopyFoot = useCallback(() => copyText('foot'), [copyText])
  const onCopyBox = useCallback(() => copyText('box'), [copyText])

  const pickTab = useCallback((t: InspectTab) => {
    setTabChoice(t)
    setCopiedFoot(false)
    setCopiedBox(false)
  }, [])

  const onTabKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!hasTailwind) return
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const next: InspectTab = tab === 'tw' ? 'css' : 'tw'
    pickTab(next)
    const btn = e.currentTarget.querySelector<HTMLButtonElement>(
      `[data-tab="${next}"]`,
    )
    btn?.focus()
  }

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

  const twCount = twClasses.length
  const footLabel = copiedFoot
    ? 'Copied'
    : tab === 'tw' && twCount
      ? `Copy ${twCount} ${twCount === 1 ? 'class' : 'classes'}`
      : 'Copy CSS'

  return (
    <>
      <section
        id="scanner-panel"
        aria-label="Inspect"
        ref={panelRef}
        // While live-hovering (not frozen) the panel is click-through so it never
        // blocks the element underneath it — letting you reach corner/edge
        // elements the floating panel would otherwise sit on top of. Clicking to
        // freeze makes it interactive again (copy, drag, etc.).
        className={
          ['sp-ip', dragging && 'dragging', !frozen && 'live']
            .filter(Boolean)
            .join(' ')
        }
        style={placement}
      >
        <header
          id="panel-header"
          className="sp-ip-head"
          onPointerDown={(e) => {
            if ((e.target as Element).closest('button')) return
            setHierAnchor(null)
            onHandlePointerDown(e)
          }}
          onMouseEnter={onHeaderEnter}
          onMouseLeave={onHeaderLeave}
        >
          <Breadcrumb
            element={panelEl}
            onSelect={freeze}
            onShowPath={onHeaderEnter}
          />
          <button
            id="panel-freeze-btn"
            type="button"
            className={'sp-ip-btn sp-ip-icon sp-ip-freeze' + (frozen ? ' is-on' : '')}
            aria-pressed={frozen}
            aria-label={frozen ? 'Unfreeze selection' : 'Freeze selection'}
            title={frozen ? 'Frozen — click to release' : 'Live — click an element to freeze'}
            onClick={() => {
              if (frozen) unfreeze()
              else if (panelEl) freeze(panelEl)
            }}
          >
            {frozen ? (
              <svg width="15" height="15" strokeWidth="1.9" {...svgProps}>
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
            ) : (
              <svg width="15" height="15" strokeWidth="1.9" {...svgProps}>
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 7.5-2" />
              </svg>
            )}
          </button>
          <button
            id="panel-close-btn"
            type="button"
            className="sp-ip-btn sp-ip-icon sp-ip-ghost"
            aria-label="Close inspector"
            title="Close inspector"
            onClick={(e) => {
              e.stopPropagation()
              disable()
            }}
          >
            <svg width="15" height="15" strokeWidth="1.9" {...svgProps}>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="sp-ip-scroll">
          {summary && (
            <div id="panel-summary" className="sp-ip-readout">
              <div className="sp-ip-dims">
                <span id="panel-dims" className="sp-ip-dims-val">
                  {summary.width}
                  <span className="sp-ip-x">×</span>
                  {summary.height}
                </span>
                <span className="sp-ip-unit">px</span>
              </div>
              <div className="sp-ip-cards">
                <div className="sp-ip-card is-font">
                  <div className="sp-ip-card-label">
                    <svg width="11" height="11" strokeWidth="2.4" {...svgProps}>
                      <path d="M4 7V4h16v3M9 20h6M12 4v16" />
                    </svg>
                    Font
                  </div>
                  <div id="panel-font">
                    {summary.family ? (
                      <>
                        <div
                          className="sp-ip-font-name"
                          style={{ fontFamily: summary.fullFamily }}
                          title={summary.fullFamily}
                        >
                          {summary.family}
                        </div>
                        <div className="sp-ip-font-meta">
                          {summary.size} / {summary.weight}
                        </div>
                      </>
                    ) : (
                      <div className="sp-ip-font-meta">—</div>
                    )}
                  </div>
                </div>
                <div className="sp-ip-card is-fill">
                  <div className="sp-ip-card-label">
                    <svg width="11" height="11" strokeWidth="2.4" {...svgProps}>
                      <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />
                    </svg>
                    Fill
                  </div>
                  <ColorValue raw={summary.fill} format={colorFormat} />
                </div>
                <div className="sp-ip-card is-text">
                  <div className="sp-ip-card-label">
                    <svg width="11" height="11" strokeWidth="2.4" {...svgProps}>
                      <path d="M4 20L10 4l6 16M6.5 14h7" />
                    </svg>
                    Text
                  </div>
                  <ColorValue raw={summary.text} format={colorFormat} />
                </div>
              </div>
            </div>
          )}

          <div className="sp-ip-tabs">
            <div
              role="tablist"
              aria-label="Code view"
              className="sp-ip-tablist"
              onKeyDown={onTabKeyDown}
            >
              {hasTailwind && (
                <button
                  type="button"
                  role="tab"
                  id="sp-ip-tab-tw"
                  data-tab="tw"
                  aria-selected={tab === 'tw'}
                  aria-controls="pane-css-rules"
                  tabIndex={tab === 'tw' ? 0 : -1}
                  className="sp-ip-btn sp-ip-tab"
                  onClick={() => pickTab('tw')}
                >
                  Tailwind
                </button>
              )}
              <button
                type="button"
                role="tab"
                id="sp-ip-tab-css"
                data-tab="css"
                aria-selected={tab === 'css'}
                aria-controls="pane-css-rules"
                tabIndex={tab === 'css' ? 0 : -1}
                className="sp-ip-btn sp-ip-tab"
                onClick={() => pickTab('css')}
              >
                CSS
              </button>
            </div>

            {tab === 'css' &&
              (canColorFormat ? (
                <div role="group" aria-label="Color format" className="sp-ip-formats">
                  {FORMATS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className="sp-ip-btn sp-ip-fmt"
                      aria-pressed={colorFormat === f.id}
                      onClick={() => setColorFormat(f.id)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      role="group"
                      aria-label="Color format (not available on the free plan)"
                      className="sp-ip-formats is-locked"
                    >
                      {FORMATS.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          className="sp-ip-btn sp-ip-fmt"
                          aria-pressed={colorFormat === f.id}
                          aria-disabled
                          onClick={() => promptUpgrade('CSS color-format switching')}
                        >
                          {f.label}
                        </button>
                      ))}
                      <IoLockClosed className="sp-ip-fmt-lock" aria-hidden="true" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    That feature is not available in the free plan
                  </TooltipContent>
                </Tooltip>
              ))}
            {tab === 'tw' && vm?.tailwind && (
              <span className="sp-ip-tabhint">
                {vm.tailwind.classes.length}{' '}
                {vm.tailwind.classes.length === 1 ? 'class' : 'classes'} · tap to
                copy one
              </span>
            )}
          </div>

          <div
            id="panel-content"
            className="sp-ip-body"
            role="tabpanel"
            aria-labelledby={tab === 'tw' ? 'sp-ip-tab-tw' : 'sp-ip-tab-css'}
          >
            <div id="pane-css-rules">
              <ColorFormatContext.Provider value={colorFormat}>
                <CssRulesView
                  vm={vm}
                  tab={tab}
                  title={summary?.name ?? ''}
                  onCopy={onCopyBox}
                  copied={copiedBox}
                />
              </ColorFormatContext.Provider>
            </div>
          </div>
        </div>

        <footer className="sp-ip-foot">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="sp-ip-btn sp-ip-ghost sp-ip-edit"
                aria-disabled
              >
                <svg width="15" height="15" strokeWidth="1.9" {...svgProps}>
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
                Edit live
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              Edit feature will be available in a future update
            </TooltipContent>
          </Tooltip>
          <button
            type="button"
            className="sp-ip-btn sp-ip-primary"
            onClick={onCopyFoot}
            aria-live="polite"
          >
            <svg width="15" height="15" strokeWidth="1.9" {...svgProps}>
              <rect x="9" y="9" width="12" height="12" rx="2" />
              <path d="M5 15V5a2 2 0 0 1 2-2h10" />
            </svg>
            {footLabel}
          </button>
        </footer>
      </section>

      <HierarchyTip
        element={panelEl}
        anchorRect={hierAnchor}
        onMouseEnter={cancelHide}
        onMouseLeave={scheduleHide}
      />
    </>
  )
}

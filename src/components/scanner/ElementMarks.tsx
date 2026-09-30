import { useMemo } from 'react'

/* Shared pieces of the Sparrow page overlays (hover highlight, frozen selection):
   the element's real corner radius, its content box (the dashed inner rectangle
   that shows where padding ends), the dashed alignment guides projected from the
   box edges, and the rose top-margin guide. Everything is derived from the
   element's computed style — nothing here is decorative data. */

export interface BoxMetrics {
  /** The element's own border-radius, so the outline hugs its real shape. */
  radius: string | undefined
  /** Content-box inset from the overlay's inner edge (border + padding), or
      null when the element has no padding / no room for an inner box. */
  inset: { top: number; right: number; bottom: number; left: number } | null
  /** Computed margin-top in px (0 when none). */
  marginTop: number
}

const px = (v: string) => parseFloat(v) || 0

export function useBoxMetrics(
  target: Element | null,
  width: number | undefined,
  height: number | undefined,
): BoxMetrics | null {
  return useMemo(() => {
    if (!target || !width || !height) return null
    const cs = window.getComputedStyle(target)

    let radius = cs.borderRadius
    if (!radius) {
      radius = [
        cs.borderTopLeftRadius,
        cs.borderTopRightRadius,
        cs.borderBottomRightRadius,
        cs.borderBottomLeftRadius,
      ].join(' ')
    }
    const hasRadius = radius.split(/\s+/).some((r) => px(r) > 0 || r.includes('%'))

    // The overlay draws a 2px border; its absolutely positioned children are
    // measured from the inside of that border, hence the - 2.
    const BORDER = 2
    const t = px(cs.borderTopWidth) + px(cs.paddingTop) - BORDER
    const r = px(cs.borderRightWidth) + px(cs.paddingRight) - BORDER
    const b = px(cs.borderBottomWidth) + px(cs.paddingBottom) - BORDER
    const l = px(cs.borderLeftWidth) + px(cs.paddingLeft) - BORDER
    const hasPadding =
      px(cs.paddingTop) + px(cs.paddingRight) + px(cs.paddingBottom) + px(cs.paddingLeft) > 0
    const inset = {
      top: Math.max(0, t),
      right: Math.max(0, r),
      bottom: Math.max(0, b),
      left: Math.max(0, l),
    }
    const roomX = width - BORDER * 2 - inset.left - inset.right
    const roomY = height - BORDER * 2 - inset.top - inset.bottom

    return {
      radius: hasRadius ? radius : undefined,
      inset: hasPadding && roomX > 2 && roomY > 2 ? inset : null,
      marginTop: Math.max(0, px(cs.marginTop)),
    }
  }, [target, width, height])
}

/* Dashed rectangle marking the content box inside a highlighted element. */
export function PaddingBox({ inset }: { inset: BoxMetrics['inset'] }) {
  if (!inset) return null
  return <div className="sp-pad-box" aria-hidden="true" style={inset} />
}

/* The four dashed guide lines projected across the viewport from a rect. */
export function GuideLines({ rect }: { rect: DOMRect }) {
  return (
    <>
      <div className="scanner-guide guide-h" style={{ top: rect.top }} />
      <div className="scanner-guide guide-h" style={{ top: rect.bottom }} />
      <div className="scanner-guide guide-v" style={{ left: rect.left }} />
      <div className="scanner-guide guide-v" style={{ left: rect.right }} />
    </>
  )
}

/* Rose distance guide for the element's margin-top, with a mono value chip.
   Skipped when there is no margin or the guide would run off the top edge. */
export function MarginGuide({
  rect,
  marginTop,
}: {
  rect: DOMRect
  marginTop: number
}) {
  if (marginTop < 1 || rect.top - marginTop < 0) return null
  const cx = rect.left + rect.width / 2
  const top = rect.top - marginTop
  return (
    <>
      <div
        className="sp-mg-line"
        style={{ left: cx - 1, top, height: marginTop }}
      />
      <div className="sp-mg-tick" style={{ left: cx - 6, top }} />
      <div
        className="sp-mg-tick"
        style={{ left: cx - 6, top: top + marginTop - 2 }}
      />
      <div
        className="sp-mg-label"
        style={{ left: cx + 10, top: top + marginTop / 2 }}
      >
        {Math.round(marginTop)}px
      </div>
    </>
  )
}

/* True when a 22px chip placed 8px below `rect` still fits in the viewport. */
export function fitsBelow(rect: DOMRect): boolean {
  return rect.bottom + 8 + 22 <= window.innerHeight
}

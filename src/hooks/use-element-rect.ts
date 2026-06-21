import { useLayoutEffect, useState } from 'react'

/* Track an element's viewport rect, updating on scroll/resize (rAF-coalesced).
   Returns null when there is no element or it has zero size. */
export function useElementRect(
  el: Element | null,
  enabled = true,
): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null)

  useLayoutEffect(() => {
    if (!el || !enabled) {
      setRect(null)
      return
    }
    let raf = 0
    const measure = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      setRect(r)
    }
    const schedule = () => {
      if (raf) return
      raf = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', schedule, { passive: true, capture: true })
    window.addEventListener('resize', schedule)
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
    ro?.observe(el)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('scroll', schedule, { capture: true })
      window.removeEventListener('resize', schedule)
      ro?.disconnect()
    }
  }, [el, enabled])

  return rect
}

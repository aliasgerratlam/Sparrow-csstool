import { useEffect, type RefObject } from 'react'

/* Reserve space at the top of the page for a fixed top banner, sized to the
   banner's real height (tracked so it stays correct if the text wraps on
   resize). Restores the page's prior inline body padding on unmount, so the
   offset exists only while the banner is on screen. */
export function useBodyTopInset(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const prev = document.body.style.paddingTop
    const apply = () => {
      document.body.style.paddingTop = `${el.offsetHeight}px`
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => {
      ro.disconnect()
      document.body.style.paddingTop = prev
    }
  }, [ref])
}

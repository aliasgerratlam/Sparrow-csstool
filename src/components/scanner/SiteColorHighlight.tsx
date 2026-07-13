import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePortalContainer } from '@/lib/portal-container'

/* Draws an outline box around every element that currently paints a selected
   site color. Portalled out of the panel so it escapes its `overflow:hidden`,
   and repositioned on scroll/resize (rAF-throttled) so the boxes track the
   elements. Purely visual — never intercepts pointer events.

   Target: the extension's shadow-tree container when present (that's where the
   injected styles live — portalling to the host `document.body` would strand
   the boxes unstyled/invisible), else `document.body` for the plain web app. */
export function SiteColorHighlight({ elements }: { elements: Element[] }) {
  const container = usePortalContainer()
  const [, force] = useState(0)

  useEffect(() => {
    let raf = 0
    const onChange = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        force((n) => n + 1)
      })
    }
    window.addEventListener('scroll', onChange, true)
    window.addEventListener('resize', onChange)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onChange, true)
      window.removeEventListener('resize', onChange)
    }
  }, [])

  const boxes = elements
    .filter((el) => el.isConnected)
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0)

  return createPortal(
    <div className="site-hl-layer" aria-hidden="true">
      {boxes.map((r, i) => (
        <span
          key={i}
          className="site-hl-box"
          style={{ top: r.top, left: r.left, width: r.width, height: r.height }}
        />
      ))}
    </div>,
    container ?? document.body,
  )
}

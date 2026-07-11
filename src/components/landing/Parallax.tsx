import { useEffect, useRef, type ElementType, type ReactNode } from 'react'
import { cn } from '@/lib/format'

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/* Scroll-linked parallax wrapper. Continuously offsets its children on the Y
   axis as a function of where the element sits in the viewport, so content
   slides bottom-to-top through its resting place as you scroll — the depth
   effect. With `fade`, opacity also rises as it enters and falls as it leaves,
   peaking while the element is mid-screen (a soft fade in and out, in place).

   `speed` is the slide distance in viewport-height fractions across a full
   pass; positive means the element rises from below (bottom → top). Driven by
   a single rAF per frame off scroll, and disabled under prefers-reduced-motion. */
export function Parallax({
  children,
  as: Tag = 'div',
  speed = 0.12,
  fade = false,
  className,
}: {
  children: ReactNode
  as?: ElementType
  speed?: number
  fade?: boolean
  className?: string
}) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    let raf = 0
    const render = () => {
      raf = 0
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight
      // progress: 0 as the element's top reaches the bottom of the viewport,
      // 1 as its bottom leaves the top. Centred so the slide is symmetric —
      // zero offset when the element sits mid-screen.
      const progress = (vh - rect.top) / (vh + rect.height)
      const offset = (0.5 - progress) * speed * vh
      el.style.transform = `translate3d(0, ${offset.toFixed(2)}px, 0)`
      el.style.willChange = 'transform'
      if (fade) {
        // 1 at mid-screen, 0 at either edge; scaled up so it reaches full
        // opacity well before centre and only fades near the edges.
        const f = 1 - Math.abs(progress - 0.5) * 2
        el.style.opacity = clamp01(f * 2.4).toFixed(3)
      }
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(render)
    }
    render()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [speed, fade])

  return (
    <Tag ref={ref} className={cn('will-change-transform', className)}>
      {children}
    </Tag>
  )
}

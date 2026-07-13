import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/format'

type Vec = { x: number; y: number }
type Spring = { p: Vec; v: Vec }

/* Cursor-magnetic wrapper. While the pointer is within `radius` of the
   element's resting centre, the wrapper is pulled toward it; two damped
   springs (semi-implicit Euler, slightly underdamped so release overshoots
   and settles with a wobble) drive the motion. The wrapper carries the body
   transform inline; a second, softer spring writes --mag-tx/--mag-ty custom
   properties that `.magnetic-label` reads, so the label drifts a little
   further than the button surface — the parallax depth cue. Mouse-only
   (touch has no hover to attract) and disabled under prefers-reduced-motion. */
export function Magnetic({
  children,
  radius = 150,
  strength = 0.35,
  textStrength = 0.45,
  className,
}: {
  children: ReactNode
  /** attraction range in px, measured from the element's resting centre */
  radius?: number
  /** fraction of the pointer offset the button body moves */
  strength?: number
  /** extra pull on the label, as a fraction of the body's target */
  textStrength?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const target: Vec = { x: 0, y: 0 }
    const body: Spring = { p: { x: 0, y: 0 }, v: { x: 0, y: 0 } }
    const label: Spring = { p: { x: 0, y: 0 }, v: { x: 0, y: 0 } }

    let raf = 0
    let last = 0

    const step = (s: Spring, t: Vec, k: number, c: number, dt: number) => {
      s.v.x += (k * (t.x - s.p.x) - c * s.v.x) * dt
      s.v.y += (k * (t.y - s.p.y) - c * s.v.y) * dt
      s.p.x += s.v.x * dt
      s.p.y += s.v.y * dt
    }

    const settled = (s: Spring) =>
      Math.abs(s.p.x) < 0.05 &&
      Math.abs(s.p.y) < 0.05 &&
      Math.abs(s.v.x) < 0.05 &&
      Math.abs(s.v.y) < 0.05

    const render = (now: number) => {
      // clamp dt so a background-tab pause doesn't explode the integration
      const dt = Math.min((now - last) / 1000, 1 / 30)
      last = now
      step(body, target, 170, 14, dt)
      step(
        label,
        { x: target.x * textStrength, y: target.y * textStrength },
        150,
        12,
        dt,
      )
      el.style.transform = `translate3d(${body.p.x.toFixed(2)}px, ${body.p.y.toFixed(2)}px, 0)`
      el.style.setProperty('--mag-tx', `${label.p.x.toFixed(2)}px`)
      el.style.setProperty('--mag-ty', `${label.p.y.toFixed(2)}px`)
      if (!target.x && !target.y && settled(body) && settled(label)) {
        raf = 0
        el.style.transform = ''
        el.style.removeProperty('--mag-tx')
        el.style.removeProperty('--mag-ty')
        return
      }
      raf = requestAnimationFrame(render)
    }
    const start = () => {
      if (raf) return
      last = performance.now()
      raf = requestAnimationFrame(render)
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      const rect = el.getBoundingClientRect()
      // the rect moves with the transform — subtract the current offset to get
      // the resting centre, or the attraction point drifts as the button chases
      const dx = e.clientX - (rect.left + rect.width / 2 - body.p.x)
      const dy = e.clientY - (rect.top + rect.height / 2 - body.p.y)
      const dist = Math.hypot(dx, dy)
      if (dist < radius) {
        // quadratic falloff: full pull near the centre, easing to zero at the
        // radius edge so entering/leaving the field never snaps
        const pull = strength * (1 - (dist / radius) ** 2)
        target.x = dx * pull
        target.y = dy * pull
        start()
      } else if (target.x || target.y) {
        target.x = 0
        target.y = 0
        start()
      }
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (raf) cancelAnimationFrame(raf)
      el.style.transform = ''
      el.style.removeProperty('--mag-tx')
      el.style.removeProperty('--mag-ty')
    }
  }, [radius, strength, textStrength])

  return (
    <span ref={ref} className={cn('magnetic-wrap', className)}>
      {children}
    </span>
  )
}

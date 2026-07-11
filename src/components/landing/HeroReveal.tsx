import { useEffect, useRef } from 'react'
import bgImage from '@/assets/bg.jpg'

/* HeroReveal — a cinematic brush-reveal of the sky texture behind the hero.
   The section starts as the clean page cream; moving the cursor paints the
   sky (bg.jpg) into view through a large feathered brush. Each brushed
   patch holds for HOLD_MS, then fades back out over FADE_MS — so the trail
   un-reveals in the order it was painted, retracting behind the cursor
   like a stroke played in reverse.

   Two canvases: an offscreen MASK canvas is rebuilt every frame from the
   list of live stamps (each drawn from a pre-rendered feathered brush
   sprite, with its alpha aged by its own clock), and the visible canvas
   draws the cover-fitted sky then multiplies it by the mask with
   `destination-in`. The brush does not sit on the cursor — it chases it
   with an exponential ease, and stamps are laid down along the path it
   travels, so fast sweeps leave a continuous fluid stroke instead of a
   dotted line. The rAF loop parks itself once the brush has caught up AND
   every stamp has fully faded. */

const BRUSH_RADIUS = 130 // px — still well beyond cursor size
const CHASE_RATE = 7 // 1/s — how hard the brush chases the cursor
const STAMP_SPACING = BRUSH_RADIUS * 0.22 // px between stamps along the path
const STAMP_ALPHA = 0.32 // per-stamp strength — washes build up organically
const HOLD_MS = 5000 // a patch stays fully revealed this long...
const FADE_MS = 1400 // ...then breathes back out over this long

interface Stamp {
  x: number
  y: number
  t: number // birth time (rAF clock)
}

export function HeroReveal() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // mask lives at CSS-pixel resolution — the feathered brush hides the
    // upscale, and it keeps per-frame painting cheap
    const mask = document.createElement('canvas')
    const maskCtx = mask.getContext('2d')
    if (!maskCtx) return

    // the brush rendered once at full strength; per-stamp aging is applied
    // via globalAlpha at draw time, so a frame costs drawImage calls, not
    // gradient rebuilds
    const sprite = document.createElement('canvas')
    sprite.width = sprite.height = BRUSH_RADIUS * 2
    const spriteCtx = sprite.getContext('2d')
    if (!spriteCtx) return
    const g = spriteCtx.createRadialGradient(
      BRUSH_RADIUS, BRUSH_RADIUS, 0,
      BRUSH_RADIUS, BRUSH_RADIUS, BRUSH_RADIUS,
    )
    g.addColorStop(0, 'rgba(255, 255, 255, 1)')
    g.addColorStop(0.5, 'rgba(255, 255, 255, 0.55)')
    g.addColorStop(1, 'rgba(255, 255, 255, 0)')
    spriteCtx.fillStyle = g
    spriteCtx.fillRect(0, 0, sprite.width, sprite.height)

    const img = new Image()
    let imgReady = false

    let width = 0
    let height = 0
    let raf = 0
    let running = false
    let lastTime = 0
    let stamps: Stamp[] = []
    // brush chases the target; targetX null until the first pointer touch
    let targetX: number | null = null
    let targetY = 0
    let brushX = 0
    let brushY = 0

    const rebuildMask = (now: number) => {
      maskCtx.clearRect(0, 0, mask.width, mask.height)
      stamps = stamps.filter((s) => now - s.t < HOLD_MS + FADE_MS)
      for (const s of stamps) {
        const age = now - s.t
        const life = age < HOLD_MS ? 1 : 1 - (age - HOLD_MS) / FADE_MS
        maskCtx.globalAlpha = STAMP_ALPHA * life
        maskCtx.drawImage(sprite, s.x - BRUSH_RADIUS, s.y - BRUSH_RADIUS)
      }
      maskCtx.globalAlpha = 1
    }

    const drawCover = () => {
      const scale = Math.max(width / img.width, height / img.height)
      const dw = img.width * scale
      const dh = img.height * scale
      ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh)
    }

    const compose = () => {
      ctx.clearRect(0, 0, width, height)
      if (!imgReady) return
      drawCover()
      if (reduceMotion) return // fully revealed, no interaction
      ctx.globalCompositeOperation = 'destination-in'
      ctx.drawImage(mask, 0, 0, width, height)
      ctx.globalCompositeOperation = 'source-over'
    }

    const layout = () => {
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      mask.width = Math.max(1, Math.round(width))
      mask.height = Math.max(1, Math.round(height))
      rebuildMask(performance.now())
      compose()
    }

    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 1 / 20)
      lastTime = now
      let chasing = false
      if (targetX !== null) {
        // exponential chase — frame-rate independent, eases out as it lands
        const k = 1 - Math.exp(-CHASE_RATE * dt)
        const nx = brushX + (targetX - brushX) * k
        const ny = brushY + (targetY - brushY) * k
        // stamp along the travelled segment so fast sweeps stay continuous
        // (no stamps while parked, or an idle cursor floods the list)
        const dist = Math.hypot(nx - brushX, ny - brushY)
        if (dist > 0.5) {
          const steps = Math.ceil(dist / STAMP_SPACING)
          for (let i = 1; i <= steps; i++) {
            stamps.push({
              x: brushX + ((nx - brushX) * i) / steps,
              y: brushY + ((ny - brushY) * i) / steps,
              t: now,
            })
          }
        }
        brushX = nx
        brushY = ny
        chasing = Math.hypot(targetX - brushX, targetY - brushY) > 1
      }
      rebuildMask(now)
      compose()
      if (chasing || stamps.length > 0) {
        raf = requestAnimationFrame(tick)
      } else {
        running = false
      }
    }

    const wake = () => {
      if (running) return
      running = true
      lastTime = performance.now()
      raf = requestAnimationFrame(tick)
    }

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      if (my < 0 || my > rect.height) return
      if (targetX === null) {
        // first touch: brush starts right under the cursor, no fly-in streak
        brushX = mx
        brushY = my
      }
      targetX = mx
      targetY = my
      wake()
    }

    img.onload = () => {
      imgReady = true
      compose()
    }
    img.src = bgImage

    const observer = new ResizeObserver(layout)
    observer.observe(canvas)
    layout()

    if (!reduceMotion) {
      window.addEventListener('pointermove', onPointerMove, { passive: true })
    }

    return () => {
      observer.disconnect()
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onPointerMove)
    }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
}

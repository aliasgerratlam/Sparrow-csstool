import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MousePointer2 } from 'lucide-react'
import { Container, Placeholder } from './parts'
import { Parallax } from './Parallax'
import { cn } from '@/lib/format'

type Feature = {
  heading: ReactNode
  body: string
  checklist?: string[]
}

const FEATURES: Feature[] = [
  {
    heading: (
      <>
        Inspect elements.<br/> <span className="hl-word text-sparrow-blue">Make changes.</span>
      </>
    ),
    body: 'Hover over any element to reveal the styles behind it. From typography and colors to spacing and layout, Sparrow gives you a clear, distraction-free view of the CSS that powers every page.',
    checklist: [
      'Computed + applied styles side by side',
      'Complete box-model visualization',
      'Fonts, colors, spacing, and dimensions at a glance',
      'One-click copy for CSS properties',
      'Real-time element highlighting',
    ],
  },
  {
    heading: (
      <>
        <span className="hl-word text-sparrow-blue">Annotate</span> it out.<br/> Fix it faster.
      </>
    ),
    body: 'Drop a pin anywhere on a live webpage to leave feedback, report issues, or capture ideas. Share a single annotated link so everyone sees the conversation in context.',
    checklist: [
      'Pin comments directly on any webpage',
      'Share a single annotated link',
      'Keep conversations in context with threaded replies',
      'Collab with your teammates',
    ],
  },
  {
    heading: (
      <>
        <span className="hl-word text-sparrow-blue">Measure spacing</span><br/> with confidence
      </>
    ),
    body: 'Measure the exact spacing between elements with smart snapping guides. Instantly see values in multiples format for faster, more consistent layouts.',
    checklist: [
      'Measure spacing between any two elements',
      'Live different format measurements',
      'Snap to edges, guides, and baselines',
    ],
  },
  {
    heading: (
      <>
        <span className="hl-word text-sparrow-blue">Capture</span> any color
      </>
    ),
    body: "Pick any color from any webpage and instantly copy it in the format you need. Whether you're building a design system or matching an existing interface, Sparrow keeps every color just a click away.",
  },
]

/* The copy + checklist for one tool, shared by the pinned slider and the
   stacked fallback so the content never drifts between the two layouts. */
function FeatureCopy({ feature }: { feature: Feature }) {
  return (
    <>
      <h3 className="font-abeezee text-4xl font-bold leading-[1.05] tracking-tight text-sparrow-ink md:text-6xl">
        {feature.heading}
      </h3>
      <p className="mt-5 max-w-xl font-abeezee text-base text-sparrow-ink">
        {feature.body}
      </p>
      {feature.checklist && (
        <ul className="mt-6 space-y-2.5">
          {feature.checklist.map((item) => (
            <li
              key={item}
              className="flex items-start gap-2.5 font-abeezee text-base text-sparrow-ink"
            >
              <MousePointer2 className="mt-0.5 size-5 shrink-0 -scale-x-100 fill-sparrow-blue text-sparrow-blue" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/* Pinned, scroll-driven tool slider — a faithful port of the reference
   "Four little tools that bend the rules." sequence:
     - a tall track (height 420vh) pins an inner 100vh stage via sticky;
     - scroll position through the track maps to a fractional tool index 0..N-1;
     - a rAF loop eases the *rendered* index toward that target (time constant
       ~0.33s), so the swap trails the scroll instead of tracking it 1:1;
     - each tool holds fully visible while |d| < HOLD, then crossfades over the
       narrow FADE window. Copy nudges ±58px; the preview card rotates away in
       3D (rotateY, page-turn style): the outgoing card swings to edge-on
       around its vertical axis while the next one turns in from the opposite
       side, so the swap reads as one continuous scroll-driven rotation. */
function PinnedTools() {
  const trackRef = useRef<HTMLDivElement>(null)
  const copyRefs = useRef<(HTMLDivElement | null)[]>([])
  const gifRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    const N = FEATURES.length
    const clamp = (x: number, a: number, b: number) =>
      Math.max(a, Math.min(b, x))
    const smooth = (u: number) => u * u * (3 - 2 * u)
    const HOLD = 0.42
    const FADE = 0.16
    // 0 while the tool is held, ramps to 1 across the fade window.
    const phase = (d: number) =>
      smooth(clamp((Math.abs(d) - HOLD) / FADE, 0, 1))

    const renderTools = (s: number) => {
      copyRefs.current.forEach((el, i) => {
        if (!el) return
        const d = s - i
        const e = phase(d)
        const ty = (d >= 0 ? -1 : 1) * e * 58
        el.style.opacity = (1 - e).toFixed(3)
        el.style.transform = `translateY(${ty.toFixed(1)}px)`
        el.style.zIndex = Math.abs(d) < 0.5 ? '2' : '1'
        el.style.pointerEvents = Math.abs(d) < 0.5 ? 'auto' : 'none'
      })
      gifRefs.current.forEach((el, i) => {
        if (!el) return
        const d = s - i
        const e = phase(d)
        // Scroll-driven 3D flip around the Y axis (page-turn): the outgoing
        // card (d>0) swings away to 90° (edge-on, invisible) while the
        // incoming card (d<0) turns in from -90° — both pass through edge-on
        // at the crossover so they never visibly overlap. A slight
        // scale-down + drift sells the depth.
        const ry = (d >= 0 ? 1 : -1) * e * 90
        const tx = (d >= 0 ? -1 : 1) * e * 36
        const scale = 1 - e * 0.1
        el.style.transform =
          `perspective(1200px) translateX(${tx.toFixed(1)}px) ` +
          `rotateY(${ry.toFixed(2)}deg) scale(${scale.toFixed(3)})`
        el.style.opacity = (1 - e).toFixed(3)
        el.style.zIndex = Math.abs(d) < 0.5 ? '2' : '1'
      })
    }

    // Eased index: scroll sets `target`, this loop walks `cur` toward it so the
    // swap animation trails the (continuous) scroll over ~1s.
    let cur: number | null = null
    let target = 0
    let raf = 0
    let lastT: number | null = null
    const TAU = 0.33

    const animTools = (t: number) => {
      raf = 0
      if (cur == null) cur = target
      const last = lastT == null ? t : lastT
      lastT = t
      let dt = (t - last) / 1000
      if (!(dt > 0)) dt = 0.016
      if (dt > 0.1) dt = 0.1
      const k = 1 - Math.exp(-dt / TAU)
      cur += (target - cur) * k
      const done = Math.abs(target - cur) < 0.0008
      if (done) cur = target
      renderTools(cur)
      if (!done) raf = requestAnimationFrame(animTools)
      else lastT = null
    }

    const updateScroll = () => {
      const vh = window.innerHeight || 800
      const r = track.getBoundingClientRect()
      const denom = Math.max(1, r.height - vh)
      const p = clamp(-r.top / denom, 0, 1)
      target = p * (N - 1)
      if (cur == null) {
        cur = target
        renderTools(cur)
      }
      if (!raf) {
        lastT = null
        raf = requestAnimationFrame(animTools)
      }
    }

    updateScroll()
    window.addEventListener('scroll', updateScroll, { passive: true })
    window.addEventListener('resize', updateScroll)
    return () => {
      window.removeEventListener('scroll', updateScroll)
      window.removeEventListener('resize', updateScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div ref={trackRef} className="relative h-[420vh]">
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div className="mx-auto grid h-[64vh] w-full max-w-[1180px] items-center gap-12 px-5 md:px-8 lg:grid-cols-[1fr_1.12fr] lg:gap-[72px]">
          {/* left: stacked copy, crossfaded in place */}
          <div className="relative h-full">
            {FEATURES.map((feature, i) => (
              <div
                key={i}
                ref={(el) => {
                  copyRefs.current[i] = el
                }}
                className="absolute inset-0 flex flex-col justify-center will-change-[opacity,transform]"
                style={{ opacity: i === 0 ? 1 : 0 }}
              >
                <FeatureCopy feature={feature} />
              </div>
            ))}
          </div>
          {/* right: each preview is its own card that slides through vertically */}
          <div className="relative h-full">
            {FEATURES.map((_, i) => (
              <div
                key={i}
                ref={(el) => {
                  gifRefs.current[i] = el
                }}
                className="absolute inset-0 will-change-[opacity,transform]"
                style={{ opacity: i === 0 ? 1 : 0 }}
              >
                <Placeholder
                  label="Product preview"
                  className="size-full rounded-[20px]"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* Stacked fallback for narrow viewports and prefers-reduced-motion: the same
   four tools as plain rows with the existing soft parallax, no scroll pin. */
function StackedRows() {
  return (
    <Container className="flex flex-col gap-16 md:gap-24">
      {FEATURES.map((feature, i) => {
        const imageRight = i % 2 === 0
        return (
          <article
            key={i}
            className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16"
          >
            <Parallax
              speed={0.1}
              fade
              className={cn(imageRight ? 'lg:order-1' : 'lg:order-2')}
            >
              <FeatureCopy feature={feature} />
            </Parallax>
            <Parallax
              speed={0.16}
              className={cn(imageRight ? 'lg:order-2' : 'lg:order-1')}
            >
              <Placeholder
                label="Product preview"
                className="aspect-16/10 w-full rounded-[20px]"
              />
            </Parallax>
          </article>
        )
      })}
    </Container>
  )
}

/* Resolve the layout up front (and keep it in sync on resize / motion-pref
   changes): the pinned slider only makes sense on a tall desktop viewport with
   motion allowed; everything else gets the stacked fallback. */
function usePinnedLayout() {
  const query = '(min-width: 1024px) and (prefers-reduced-motion: no-preference)'
  const [pin, setPin] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setPin(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return pin
}

export function FeatureRows() {
  const pin = usePinnedLayout()
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="py-20 text-black md:py-28"
    >
      <h2 id="features-heading" className="sr-only">
        Features
      </h2>
      {pin ? <PinnedTools /> : <StackedRows />}
    </section>
  )
}

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MousePointer2 } from 'lucide-react'
import { Container } from './parts'
import { Parallax } from './Parallax'
import { cn } from '@/lib/format'
import inspectVideo from '@/assets/inspect_Css.mp4'
import annotateVideo from '@/assets/annotate_1.mp4'
import rulerVideo from '@/assets/ruler_css.mp4'
import colorVideo from '@/assets/color_css_new.mp4'
import fontVideo from '@/assets/font_css.mp4'
import assetsVideo from '@/assets/assest_downloader.mp4'

type Feature = {
  heading: ReactNode
  body: string
  video: string
  checklist?: string[]
}

const FEATURES: Feature[] = [
  {
    heading: (
      <>
        Inspect any element.<br/> <span className="hl-word text-sparrow-blue">Understand every style.</span>
      </>
    ),
    body: 'Hover over anything on a page and Sparrow shows you the CSS that actually shaped it the full css, DevTools-style, with overridden rules struck through and the winning declaration on top. If the site uses Tailwind, Sparrow detects it and shows the utility classes separately, ready to copy.',
    video: inspectVideo,
    checklist: [
      'The real CSS, media queries, states, and pseudo-elements included',
      'Tailwind classes detected and copyable in one click',
      'Dimensions, font, and colors summarized at a glance',
      'Copy clean, ready-to-paste CSS for any element',
      'Freeze any selection and browse its full DOM path',
      'Multiple color formats',
    ],
  },
  {
    heading: (
      <>
        <span className="hl-word text-sparrow-blue">Feedback</span> that lives<br/> on the page.
      </>
    ),
    body: "Drop a numbered pin on the exact element you're talking about, write your comment, and share one link. Everyone who opens it sees your notes in context and can reply, resolve, and collaborate live, cursors and all.",
    video: annotateVideo,
    checklist: [
      'Pin comments to exact elements no screenshots needed',
      'Threaded replies with Open / Resolved statuses',
      'One share link puts your whole team on the same page',
      'Live collabrations show who’s reviewing what',
      'Client mode lets reviewers comment without touching your notes',
    ],
  },
  {
    heading: (
      <>
        <span className="hl-word text-sparrow-blue">Measure spacing</span><br/> to the pixel.
      </>
    ),
    body: 'Click any element to anchor it, then hover anywhere else Sparrow draws the exact distance between them, with alignment guides projected across the whole viewport so misaligned layouts have nowhere to hide.',
    video: rulerVideo,
    checklist: [
      'Measure the gap between any two elements',
      'Alignment guides reveal what lines up — and what doesn’t',
      'Visual QA without opening a design file',
    ],
  },
  {
    heading: (
      <>
        Discover every color,<br/> <span className="hl-word text-sparrow-blue">Rebrand any website in seconds.</span>
      </>
    ),
    body: "Sparrow scans the entire page and lists every color it paints, sorted by how much it's used. Click one to highlight everywhere it appears or swap it site wide to preview a rebrand in seconds. Copy any value as HEX, RGBA, or HSL.",
    video: colorVideo,
    checklist: [
      'The full palette with usage percentages and element counts',
      'Highlight every element using a given color',
      'Recolor the whole site live, then reset with one click',
      'Copy values in HEX, RGBA, or HSL',
    ],
  },
  {
    heading: (
      <>
        Try <span className="hl-word text-sparrow-blue">any font</span><br/> on a live website.
      </>
    ),
    body: 'Audit every typeface a page uses, then preview a replacement instantly pick from about 1,900 Google Fonts or upload your own brand font. Swap the whole site or a single element; sizes, weights, and spacing stay exactly as they were.',
    video: fontVideo,
    checklist: [
      'Every font on the page, with usage stats',
      'Search the full Google Fonts catalog with live previews',
      'Upload your own .ttf, .otf, .woff, or .woff2. it never leaves your browser',
      'Swap site-wide or one element at a time, and reset anytime',
    ],
  },
  {
    heading: (
      <>
        Every asset,<br/> <span className="hl-word text-sparrow-blue">Ready to download.</span>
      </>
    ),
    body: "Sparrow finds every image, SVG, and video a page uses including background images, favicons, and inline SVG that right click can't save. Download a single asset, or grab everything at once as a ZIP.",
    video: assetsVideo,
    checklist: [
      'Finds images, SVGs, and videos even in CSS backgrounds',
      'Filter by type, see dimensions and usage counts',
      'Download one file or the whole page as a ZIP',
    ],
  },
]

/* Looping, muted preview clip for one tool — shared by the pinned slider and
   the stacked fallback. Playback is viewport-gated: an IntersectionObserver
   plays the clip once it scrolls into view and pauses it when it leaves, so
   off-screen videos don't burn CPU/battery. `playsInline` keeps it inline on
   mobile and `preload="metadata"` avoids fetching every clip up front. */
function FeatureVideo({ feature, className }: { feature: Feature; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          // play() rejects if interrupted (e.g. element unmounts) — ignore.
          void el.play().catch(() => {})
        } else {
          el.pause()
        }
      },
      { threshold: 0.25 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <video
      ref={ref}
      src={feature.video}
      className={cn('object-cover', className)}
      loop
      muted
      playsInline
      preload="metadata"
      aria-label="Product preview"
    />
  )
}

/* The copy + checklist for one tool, shared by the pinned slider and the
   stacked fallback so the content never drifts between the two layouts. */
function FeatureCopy({ feature }: { feature: Feature }) {
  return (
    <>
      <h3 className="font-abeezee text-4xl font-bold leading-[1.05] tracking-tight text-sparrow-ink md:text-5xl text-left">
        {feature.heading}
      </h3>
      <p className="mt-5 max-w-xl font-abeezee text-base text-sparrow-ink text-left">
        {feature.body}
      </p>
      {feature.checklist && (
        <ul className="mt-6 space-y-2.5">
          {feature.checklist.map((item) => (
            <li
              key={item}
              className="flex items-start gap-2.5 font-abeezee text-base text-sparrow-ink text-left"
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
    <div
      ref={trackRef}
      className="relative"
      style={{ height: `${FEATURES.length * 105}vh` }}
    >
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
                className="absolute inset-0 flex flex-col items-start justify-center text-center will-change-[opacity,transform]"
                style={{ opacity: i === 0 ? 1 : 0 }}
              >
                <FeatureCopy feature={feature} />
              </div>
            ))}
          </div>
          {/* right: each preview is its own card that slides through vertically */}
          <div className="relative h-full">
            {FEATURES.map((feature, i) => (
              <div
                key={i}
                ref={(el) => {
                  gifRefs.current[i] = el
                }}
                className="absolute inset-0 flex flex-col items-center justify-center will-change-[opacity,transform]"
                style={{ opacity: i === 0 ? 1 : 0 }}
              >
                <FeatureVideo
                  feature={feature}
                  className="h-[340px] w-full rounded-[20px]"
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
    <Container className="flex flex-col gap-6 md:gap-24">
      {FEATURES.map((feature, i) => {
        const imageRight = i % 2 === 0
        return (
          <article
            key={i}
            className="grid items-center gap-2 lg:grid-cols-2 lg:gap-16"
          >
            {/* On the stacked (mobile/tablet) layout the video comes first for
                every feature (order-1 vs the copy's order-2); at lg the
                per-row lg:order-* classes restore the alternating desktop
                arrangement. */}
            <Parallax
              speed={0.1}
              fade
              className={cn('order-2', imageRight ? 'lg:order-1' : 'lg:order-2')}
            >
              <FeatureCopy feature={feature} />
            </Parallax>
            <Parallax
              speed={0.16}
              className={cn('order-1', imageRight ? 'lg:order-2' : 'lg:order-1')}
            >
              <FeatureVideo
                feature={feature}
                className="h-[340px] w-full rounded-[20px]"
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

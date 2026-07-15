import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { cn } from '@/lib/format'
import { Container } from './parts'

const FEATURE_CASE = {
  title: 'Frontend developers',
  body: "Debug styles faster than DevTools for everyday questions: what's this font, why is this margin off, which rule wins? Copy the CSS or Tailwind classes and get back to your editor.",
}

const USE_CASES = [
  {
    title: 'Designers',
    body: 'Reverse-engineer interfaces you admire. Extract the palette with real usage data, identify every typeface, test your own fonts on a live page, and pull assets for your moodboard.',
  },
  {
    title: 'Agencies & freelancers',
    body: 'Turn client feedback from vague emails into pinned, threaded, resolvable comments on the live site. Share one link, watch the review happen in real time, and close items as you ship.',
  },
  {
    title: 'QA & product teams',
    body: 'Report visual bugs where they happen. Measure spacing against spec, flag misalignments with the ruler, and file annotations your developers can find without a repro guide.',
  },
]

/* Writes the cursor position into --rx/--ry custom properties the .uc-card
   CSS reads to tilt the card toward the pointer. Mouse-only (touch has no
   hover) and inert under prefers-reduced-motion. */
function TiltCard({
  className,
  flat = false,
  children,
}: {
  className?: string
  flat?: boolean
  children: ReactNode
}) {
  const ref = useRef<HTMLElement>(null)

  const onMove = (e: ReactPointerEvent<HTMLElement>) => {
    const el = ref.current
    if (!el || e.pointerType !== 'mouse') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const rect = el.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    el.style.setProperty('--rx', `${((0.5 - py) * 10).toFixed(2)}deg`)
    el.style.setProperty('--ry', `${((px - 0.5) * 12).toFixed(2)}deg`)
  }

  const onLeave = () => {
    const el = ref.current
    if (!el) return
    el.style.removeProperty('--rx')
    el.style.removeProperty('--ry')
  }

  return (
    <article
      ref={ref}
      className={cn('uc-card p-8', flat && 'uc-card--flat', className)}
      onPointerMove={flat ? undefined : onMove}
      onPointerLeave={flat ? undefined : onLeave}
    >
      {children}
    </article>
  )
}

export function UseCasesSection() {
  return (
    <section aria-labelledby="use-cases-heading" className="py-16 md:py-24">
      <Container>
        <h2
          id="use-cases-heading"
          className="text-center font-abeezee text-4xl font-bold leading-[1.05] tracking-tight text-sparrow-ink md:text-6xl"
        >
          One toolkit, <span className="hl-word text-sparrow-blue">four jobs done.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-center font-abeezee text-base text-sparrow-ink">
          Sparrow replaces a handful of single-purpose extensions with one overlay
          that stays out of your way.
        </p>

        {/* bento grid: one dark feature card, three light cards beside it
            (the last one spanning the right column's full width) */}
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <TiltCard className="uc-card-dark flex flex-col justify-center p-10 md:p-12">
            <h3 className="uc-title font-abeezee text-3xl font-bold leading-tight text-white md:text-4xl">
              {FEATURE_CASE.title}
            </h3>
            <p className="uc-body mt-5 max-w-md font-abeezee text-base leading-relaxed text-white/75">
              {FEATURE_CASE.body}
            </p>
          </TiltCard>

          <div className="grid gap-6 sm:grid-cols-2">
            {USE_CASES.map((useCase, i) => (
              <TiltCard
                key={useCase.title}
                flat
                className={cn(i === USE_CASES.length - 1 && 'sm:col-span-2')}
              >
                <h3 className="uc-title font-abeezee text-xl font-semibold text-sparrow-ink">
                  {useCase.title}
                </h3>
                <p className="uc-body mt-3 font-abeezee text-base leading-relaxed text-sparrow-ink">
                  {useCase.body}
                </p>
              </TiltCard>
            ))}
          </div>
        </div>
      </Container>
    </section>
  )
}

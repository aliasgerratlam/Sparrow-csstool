import { LandingHeader } from './LandingHeader'
import { Hero } from './Hero'
import { StepsSection } from './StepsSection'
import { FeaturesSection } from './FeaturesSection'
import { UseCasesSection } from './UseCasesSection'
import { PricingSection } from './PricingSection'
import { FaqSection } from './FaqSection'
import { CtaSection } from './CtaSection'
import { LandingFooter } from './LandingFooter'

type Orb = {
  /** Horizontal anchor: distance from the left or right page edge. */
  edge: 'left' | 'right'
  x: number
  top: number
  w: number
  h?: number
  color: string
  opacity: number
  blur: number
  /** Slow drift, in seconds of negative delay; omitted = static. */
  drift?: number
}

/* The soft blue glows the glass surfaces blur over. Desktop and phone sets are
   laid out separately (the design places them by page height), the first three
   on each drift slowly. */
const DESKTOP_ORBS: Orb[] = [
  { edge: 'left', x: -160, top: -120, w: 640, color: '#2563eb', opacity: 0.22, blur: 120, drift: 0 },
  { edge: 'right', x: -200, top: 260, w: 700, color: '#60a5fa', opacity: 0.3, blur: 130, drift: 6 },
  { edge: 'left', x: 380, top: 980, w: 520, color: '#a5b4fc', opacity: 0.35, blur: 120, drift: 11 },
  { edge: 'left', x: -220, top: 2500, w: 620, color: '#93c5fd', opacity: 0.35, blur: 130 },
  { edge: 'right', x: -160, top: 3500, w: 600, color: '#2563eb', opacity: 0.16, blur: 130 },
  { edge: 'left', x: 300, top: 4500, w: 700, h: 560, color: '#bfdbfe', opacity: 0.55, blur: 130 },
  { edge: 'right', x: -120, top: 5700, w: 560, color: '#60a5fa', opacity: 0.26, blur: 130 },
  { edge: 'left', x: -100, top: 6300, w: 520, color: '#a5b4fc', opacity: 0.3, blur: 120 },
]

const MOBILE_ORBS: Orb[] = [
  { edge: 'left', x: -180, top: -120, w: 420, color: '#2563eb', opacity: 0.22, blur: 90, drift: 0 },
  { edge: 'right', x: -200, top: 420, w: 440, color: '#60a5fa', opacity: 0.32, blur: 90, drift: 6 },
  { edge: 'left', x: -160, top: 1500, w: 400, color: '#a5b4fc', opacity: 0.35, blur: 90, drift: 11 },
  { edge: 'right', x: -180, top: 2700, w: 420, color: '#93c5fd', opacity: 0.4, blur: 90 },
  { edge: 'left', x: -160, top: 4100, w: 420, color: '#2563eb', opacity: 0.16, blur: 90 },
  { edge: 'right', x: -160, top: 5400, w: 440, color: '#bfdbfe', opacity: 0.6, blur: 90 },
  { edge: 'left', x: -160, top: 6800, w: 420, color: '#60a5fa', opacity: 0.26, blur: 90 },
  { edge: 'right', x: -140, top: 7900, w: 400, color: '#a5b4fc', opacity: 0.3, blur: 90 },
]

function Orbs({ orbs, className }: { orbs: Orb[]; className: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      {orbs.map((o, i) => (
        <div
          key={i}
          className={o.drift === undefined ? 'absolute rounded-full' : 'lp-drift absolute rounded-full'}
          style={{
            [o.edge]: o.x,
            top: o.top,
            width: o.w,
            height: o.h ?? o.w,
            background: o.color,
            opacity: o.opacity,
            filter: `blur(${o.blur}px)`,
            animationDelay: o.drift ? `-${o.drift}s` : undefined,
          }}
        />
      ))}
    </div>
  )
}

/* Sparrow marketing landing page — the Claude Design "Sparrow website
   redesign" (desktop + mobile boards). This is the app's index ("/"); the
   scanner/annotation chrome is mounted alongside it (see App.tsx) so the hero's
   "Try the live demo" CTA inspects this page. */
export function LandingPage() {
  return (
    <div className="lp-root relative min-h-screen overflow-x-clip bg-white text-lp-ink antialiased">
      <Orbs orbs={DESKTOP_ORBS} className="hidden lg:block" />
      <Orbs orbs={MOBILE_ORBS} className="lg:hidden" />
      <div className="relative">
        <LandingHeader />
        <main>
          <Hero />
          <StepsSection />
          <FeaturesSection />
          <UseCasesSection />
          <PricingSection />
          <FaqSection />
          <CtaSection />
        </main>
        <LandingFooter />
      </div>
    </div>
  )
}

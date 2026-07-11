import { useScanner } from '@/context/scanner-context'
import { LandingHeader } from './LandingHeader'
import { Hero } from './Hero'
import { StepsSection } from './StepsSection'
import { FeatureRows } from './FeatureRows'
import { FeedbackSection } from './FeedbackSection'
import { PricingSection } from './PricingSection'
import { FaqSection } from './FaqSection'
import { CtaSection } from './CtaSection'
import { LandingFooter } from './LandingFooter'
import footerGradient from '@/assets/footer-gradient.svg'

/* Sparrow marketing landing page, rebuilt from the Figma "Sparrow Site" design.
   This is the app's index ("/"). The scanner/annotation chrome is mounted
   alongside it (see App.tsx) so the hero "Try Demo" CTA inspects this page. */
export function LandingPage() {
  const { enable } = useScanner()
  return (
    <div className="min-h-screen bg-sparrow-cream font-abeezee text-sparrow-ink antialiased">
      <LandingHeader />
      <main>
        <Hero />
        <StepsSection />
        <FeatureRows />
        <FeedbackSection />
        <PricingSection />
        <FaqSection />
      </main>
      {/* CTA + footer share one blurred blue gradient backdrop (footer-gradient
          SVG) so the blue flows seamlessly from the CTA card into the footer. */}
      <div className="relative isolate">
        <img
          src={footerGradient}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 size-full object-cover object-bottom"
          style={{
            WebkitMaskImage:
              'linear-gradient(to bottom, transparent 0, #000 220px)',
            maskImage: 'linear-gradient(to bottom, transparent 0, #000 220px)',
          }}
        />
        <CtaSection />
        <LandingFooter
          onInstall={() => {
            enable()
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        />
      </div>
    </div>
  )
}

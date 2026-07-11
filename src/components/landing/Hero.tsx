import { useScanner } from '@/context/scanner-context'
import { HeroReveal } from './HeroReveal'
import { ArrowButton, Container } from './parts'

/* Hero — starts as the clean page cream; moving the cursor sweeps a huge
   feathered brush that reveals the sky texture (bg.jpg) underneath, and
   everything revealed stays revealed (HeroReveal, a canvas effect). The
   .hero-reveal wrapper (index.css) masks the bottom so the revealed sky
   dissolves into the cream before the next section; a grain layer sits on
   top so the flat field doesn't band. */
export function Hero() {
  const { isActive, toggle, enable } = useScanner()
  return (
    <section
      id="home"
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden py-24"
    >
      <div aria-hidden className="hero-reveal">
        <HeroReveal />
        <div className="hero-noise" />
      </div>
      {/* the container itself is pointer-transparent so hovers in its empty
          gutters fall through to the columns; its children stay interactive */}
      <Container className="pointer-events-none relative z-10 text-center [&>*]:pointer-events-auto">
        <h1 className="mx-auto text-balance font-abeezee text-4xl font-extrabold leading-[1.08] tracking-tight text-sparrow-ink md:text-6xl lg:text-[64px]">
          Everything you need to{' '}
          <span className="hl-word text-sparrow-blue">
            <span className="hl-pop">inspect,</span> <span className="hl-pop">measure,</span>
          </span>{' '}
          and <span className="hl-word text-sparrow-blue hl-pop">understand</span> any
          webpage
        </h1>
        <p className="mx-auto mt-6 text-balance font-abeezee text-lg text-sparrow-ink md:text-xl">
          Stop switching between extensions. Inspect styles, annotate pages, extract colors, and measure layouts with one lightweight toolkit that stays out of your way.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {/* No published extension yet — the install CTA runs the in-page demo. */}
          <ArrowButton variant="blue" onClick={enable}>
            Install on your browser
          </ArrowButton>
          <ArrowButton
            variant="dark"
            arrow={false}
            onClick={toggle}
            sparkle
            className="scanner-demo-toggle"
          >
            {isActive ? 'Stop Demo' : 'Try Demo'}
          </ArrowButton>
        </div>
      </Container>
    </section>
  )
}

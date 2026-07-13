import { useScanner } from '@/context/scanner-context'
import { HeroSky } from './HeroSky'
import { ArrowButton, Container } from './parts'

/* Hero — the sky texture (bg.jpg) rendered through a WebGL shader
   (HeroSky): hovering rests a gravitational vortex on the cursor and
   moving stirs more of them along the path, twisting the clouds around
   the pointer. The .hero-sky wrapper (index.css) provides the sky-blue
   backdrop / no-WebGL fallback and masks the bottom so the sky dissolves
   into the page cream before the next section; a grain layer sits on top
   so the soft field doesn't band. */
export function Hero() {
  const { isActive, toggle, enable } = useScanner()
  return (
    <section
      id="home"
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden py-24"
    >
      <div aria-hidden className="hero-sky">
        <HeroSky />
        <div className="hero-noise" />
      </div>
      {/* the container itself is pointer-transparent so hovers in its empty
          gutters fall through to the columns; its children stay interactive */}
      <Container className="pointer-events-none relative z-10 text-center [&>*]:pointer-events-auto">
        <h1 className="mx-auto text-balance font-abeezee text-4xl font-extrabold leading-[1.08] tracking-tight text-sparrow-ink md:text-6xl lg:text-[80px]">
          Everything you need to <span className="hl-word text-sparrow-blue hl-pop">understand</span> any website
        </h1>
        {/* <h1 className="mx-auto text-balance font-abeezee text-4xl font-extrabold leading-[1.08] tracking-tight text-sparrow-ink md:text-6xl lg:text-[64px]">
          See how any website is{' '}
          <span className="hl-word text-sparrow-blue hl-pop">built</span> and show
          exactly what should <span className="hl-word text-sparrow-blue hl-pop">change</span>
        </h1> */}
        <p className="mx-auto mt-6 text-balance font-abeezee text-lg text-sparrow-ink md:text-xl">
          Inspect CSS, annotate pages, collaborate live, extract colors, fonts and assets—all from one lightweight browser extension built for developers, designers, and agencies.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {/* No published extension yet — the install CTA runs the in-page demo. */}
          <ArrowButton variant="blue" onClick={enable}>
            Add Sparrow to your browser
          </ArrowButton>
          <ArrowButton
            variant="dark"
            arrow={false}
            onClick={toggle}
            sparkle
            magnetic
            className="scanner-demo-toggle"
          >
            {isActive ? 'Stop demo' : 'Try the live demo'}
          </ArrowButton>
        </div>
      </Container>
    </section>
  )
}

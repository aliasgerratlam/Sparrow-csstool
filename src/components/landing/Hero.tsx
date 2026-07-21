import { useScanner } from '@/context/scanner-context'
import { useExtensionDownload } from '@/hooks/use-extension-download'
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
  const { isActive, toggle } = useScanner()
  const { getExtension } = useExtensionDownload()
  return (
    <section
      id="home"
      className="relative flex lg:min-h-screen min-h-[80vh] flex-col items-center justify-center overflow-hidden py-24"
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
        {/* CTAs. Below 992px only the install button shows, full-width (the
            live-demo scanner relies on hover, so it's hidden on touch/narrow
            viewports). At >=992px both sit side by side at their natural
            widths. The demo button is wrapped in a div so the whole magnetic
            unit toggles with `hidden` (ArrowButton's className reaches only the
            inner button, not the .magnetic-wrap). */}
        <div className="mx-auto mt-8 flex w-full max-w-md flex-col items-center justify-center gap-3 min-[992px]:max-w-none min-[992px]:flex-row">
          {/* Opens the extension's store listing for the visitor's browser
              (Chrome Web Store vs Firefox Add-ons). The demo lives on the
              button beside it. */}
          <ArrowButton
            variant="blue"
            onClick={getExtension}
            className="w-full min-[992px]:w-auto"
          >
            Get the Sparrow Extension
          </ArrowButton>
          <div className="hidden min-[992px]:block">
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
        </div>
      </Container>
    </section>
  )
}

import { useExtensionDownload } from '@/hooks/use-extension-download'
import { ArrowButton, Container } from './parts'

export function CtaSection() {
  const { getExtension } = useExtensionDownload()
  return (
    <section
      aria-labelledby="cta-heading"
      className="px-4 pb-15 pt-16 md:px-8 md:pb-10 md:pt-24"
    >
      <Container className="max-w-[1280px] px-0">
        <div
          className="md:min-h-[650px] min-h-[350px] flex items-center flex-col justify-center relative overflow-hidden rounded-[20px] border border-white/40 px-6 py-20 text-center backdrop-blur-2xl md:py-28"
          style={{
            background:
              'radial-gradient(75% 110% at 50% 32%, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.28) 42%, rgba(255,255,255,0.08) 100%)',
          }}
        >
          <h2
            id="cta-heading"
            className="mx-auto max-w-3xl font-abeezee text-3xl font-semibold leading-tight tracking-tight text-sparrow-ink md:text-6xl"
          >
            Stop guessing what's on the page. Start knowing.
          </h2>
          <div className="mt-8 flex justify-center">
            {/* Opens the extension's store listing for the visitor's browser. */}
            <ArrowButton variant="blue" onClick={getExtension}>
              Add Sparrow — it's free
            </ArrowButton>
          </div>
        </div>
      </Container>
    </section>
  )
}

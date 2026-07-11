import { useScanner } from '@/context/scanner-context'
import { ArrowButton, Container } from './parts'

export function CtaSection() {
  const { enable } = useScanner()
  return (
    <section
      aria-labelledby="cta-heading"
      className="px-4 pb-15 pt-16 md:px-8 md:pb-10 md:pt-24"
    >
      <Container className="max-w-[1280px] px-0">
        <div
          className="min-h-[650px] flex items-center flex-col justify-center relative overflow-hidden rounded-[20px] border border-white/40 px-6 py-20 text-center backdrop-blur-2xl md:py-28"
          style={{
            background:
              'radial-gradient(75% 110% at 50% 32%, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.28) 42%, rgba(255,255,255,0.08) 100%)',
          }}
        >
          <h2
            id="cta-heading"
            className="mx-auto max-w-3xl font-abeezee text-3xl font-semibold leading-tight tracking-tight text-sparrow-ink md:text-6xl"
          >
            Ready to simplify your web workflow?
          </h2>
          <div className="mt-8 flex justify-center">
            {/* No published extension yet — runs the in-page demo. */}
            <ArrowButton
              variant="blue"
              onClick={() => {
                enable()
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            >
              Install Now
            </ArrowButton>
          </div>
        </div>
      </Container>
    </section>
  )
}

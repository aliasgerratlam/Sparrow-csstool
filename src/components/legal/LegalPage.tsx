import { useEffect, type ReactNode } from 'react'
import { LandingHeader } from '@/components/landing/LandingHeader'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { Container } from '@/components/landing/parts'
import footerGradient from '@/assets/footer-gradient.svg'

/* Shared chrome for the static legal pages (/privacy, /terms). Wears the same
   Sparrow landing look — fixed LandingHeader on top, the shared blue-gradient
   footer at the bottom — so the pages read as part of the marketing site. The
   article body is rendered by each page via <LegalSection>/<LegalList>. */
export function LegalPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string
  updated: string
  intro?: ReactNode
  children: ReactNode
}) {
  // Legal links are reached from the footer of any page, so always start at top.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="min-h-screen bg-sparrow-cream font-abeezee text-sparrow-ink antialiased">
      <LandingHeader />

      {/* Clear the fixed header (logo pill sits ~96px tall at the top). */}
      <main className="pb-24 pt-28 md:pt-32">
        <Container>
          <div className="mx-auto max-w-3xl">
            <header className="border-b border-black/10 pb-8">
              <h1 className="text-3xl font-semibold text-sparrow-navy md:text-4xl">
                {title}
              </h1>
              <p className="mt-3 text-sm text-sparrow-ink/50">
                Last updated: {updated}
              </p>
              {intro && (
                <div className="mt-5 text-base leading-relaxed text-sparrow-ink/70">
                  {intro}
                </div>
              )}
            </header>

            <article className="mt-10 flex flex-col gap-10">{children}</article>
          </div>
        </Container>
      </main>

      {/* Footer over the shared blue gradient, matching the landing page. */}
      <div className="relative isolate">
        <img
          src={footerGradient}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 size-full object-cover object-bottom"
          style={{
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 220px)',
            maskImage: 'linear-gradient(to bottom, transparent 0, #000 220px)',
          }}
        />
        <LandingFooter />
      </div>
    </div>
  )
}

/* A titled section within a legal document. */
export function LegalSection({
  heading,
  children,
}: {
  heading: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold text-sparrow-navy md:text-2xl">
        {heading}
      </h2>
      <div className="flex flex-col gap-3 text-base leading-relaxed text-sparrow-ink/75">
        {children}
      </div>
    </section>
  )
}

/* Bulleted list matching the body copy style. */
export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="ml-5 flex list-disc flex-col gap-2 marker:text-sparrow-ink/40">
      {items.map((item, i) => (
        <li key={i} className="pl-1">
          {item}
        </li>
      ))}
    </ul>
  )
}

import { Wordmark } from './Wordmark'
import { Container } from './parts'

const NAV = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
]

/* `onInstall` runs the in-page demo when the footer is mounted on a page that
   carries the scanner (the landing/index page passes it). Without it — e.g. on
   the account page, which has no scanner — the button instead sends the user to
   the index where the demo lives, so the footer stays context-free and safe to
   render anywhere. */
export function LandingFooter({ onInstall }: { onInstall?: () => void }) {
  const handleInstall = onInstall ?? (() => (window.location.href = '/'))
  return (
    <footer className="relative overflow-hidden pt-16">
      <Container>
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Wordmark dark logoHeight={40} />
            <p className="mt-0 font-abeezee text-sm text-white/85">
              Inspect anything.
              <br />
              Leave nothing to guesswork.
            </p>
          </div>

          <div className="flex flex-col gap-6 md:items-end">
            <nav
              aria-label="Footer"
              className="flex flex-wrap items-center gap-x-8 gap-y-3"
            >
              {/* No published extension yet — the install link runs the demo. */}
              <button
                type="button"
                onClick={handleInstall}
                className="cursor-pointer font-abeezee text-sm font-medium text-white/90 transition-colors hover:text-white"
              >
                Install
              </button>
              {NAV.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="font-abeezee text-sm font-medium text-white/90 transition-colors hover:text-white"
                >
                  {item.label}
                </a>
              ))}
            </nav>

            <p className="font-abeezee text-sm text-white/80">
              © 2026. All copyright reserved
            </p>
          </div>
        </div>
      </Container>

      {/* Oversized brand watermark behind the footer */}
      <span
        aria-hidden
        className="pointer-events-none block select-none bg-linear-to-b from-white/20 to-transparent bg-clip-text text-center font-abeezee font-bold leading-[0.8] tracking-tight text-transparent"
        style={{ fontSize: 'clamp(80px, 22vw, 420px)' }}
      >
        Sparrow
      </span>
    </footer>
  )
}

import { useLocation, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useExtensionDownload } from '@/hooks/use-extension-download'
import { Wordmark } from './Wordmark'
import { Container } from './parts'

const NAV = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
]

/* The footer is rendered on the landing/index page and on /account; the Install
   button downloads the built extension zip (a same-origin static file), so it
   works the same on any page without needing the scanner. */
export function LandingFooter() {
  const navigate = useNavigate()
  const onAccount = useLocation().pathname.startsWith('/account')
  const { downloading, download } = useExtensionDownload()

  // Same-page: smooth-scroll to the section. On /account (no sections): navigate
  // client-side to the landing page and let RouterBridge scroll there.
  const handleNavClick = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    if (onAccount) {
      navigate(`/${href}`) // e.g. "/#features"
      return
    }
    document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth' })
  }
  return (
    <footer className="relative overflow-hidden md:pt-16 pt-0">
      <Container>
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Wordmark dark logoHeight={40} />
            <p className="mt-0 font-abeezee text-sm text-white/85">
              Inspect anything.
              <br />
              Explain everything.
            </p>
          </div>

          <div className="flex flex-col gap-6 md:items-end">
            <nav
              aria-label="Footer"
              className="flex flex-wrap items-center gap-x-8 gap-y-3"
            >
              {/* Downloads the built extension zip for the visitor's browser. */}
              <button
                type="button"
                onClick={download}
                disabled={downloading}
                className="inline-flex cursor-pointer items-center gap-1.5 font-abeezee text-sm font-medium text-white/90 transition-colors hover:text-white disabled:cursor-default"
              >
                {downloading && <Loader2 className="size-3.5 animate-spin" />}
                {downloading ? 'Downloading…' : 'Install'}
              </button>
              {NAV.map((item) => (
                <a
                  key={item.label}
                  href={onAccount ? `/${item.href}` : item.href}
                  onClick={handleNavClick(item.href)}
                  className="font-abeezee text-sm font-medium text-white/90 transition-colors hover:text-white"
                >
                  {item.label}
                </a>
              ))}
            </nav>

            <p className="font-abeezee text-sm text-white/80">
              © 2026 Sparrow. All rights reserved.
            </p>
          </div>
        </div>
      </Container>

      {/* Oversized brand watermark behind the footer */}
      <span
        aria-hidden
        className="pointer-events-none block select-none bg-linear-to-b from-white/20 to-transparent bg-clip-text text-center font-abeezee font-bold leading-[0.8] tracking-tight text-transparent"
        style={{ fontSize: 'clamp(80px, 26vw, 420px)' }}
      >
        Sparrow
      </span>
    </footer>
  )
}

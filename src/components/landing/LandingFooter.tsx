import { useLocation, useNavigate } from 'react-router-dom'
import { BookOpen, Loader2 } from 'lucide-react'
import { useExtensionDownload } from '@/hooks/use-extension-download'
import { useInstallGuide } from '@/context/install-guide-context'
import { Wordmark } from './Wordmark'
import { Container } from './parts'

const NAV = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
]

// Route links (not in-page anchors) — rendered as a separate legal row.
const LEGAL = [
  { label: 'Privacy Policy', to: '/privacy' },
  { label: 'Terms & Conditions', to: '/terms' },
]

/* The footer is rendered on the landing/index page and on /account; the Install
   button downloads the built extension zip (a same-origin static file), so it
   works the same on any page without needing the scanner. */
export function LandingFooter() {
  const navigate = useNavigate()
  const onLanding = useLocation().pathname === '/'
  const { downloading, download } = useExtensionDownload()
  const { openGuide } = useInstallGuide()

  // Same-page: smooth-scroll to the section. On pages without the landing
  // sections (/account, /privacy, /terms): navigate client-side to the landing
  // page and let RouterBridge scroll there.
  const handleNavClick = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    if (!onLanding) {
      navigate(`/${href}`) // e.g. "/#features"
      return
    }
    document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth' })
  }
  return (
    <footer className="relative overflow-hidden md:pt-16 pt-0">
      <Container>
        <div className="flex flex-col items-center gap-10 text-center md:flex-row md:items-start md:justify-between md:text-left">
          <div className="flex max-w-sm flex-col items-center md:block">
            <Wordmark dark logoHeight={40} />
            <p className="mt-0 font-abeezee text-sm text-white/85">
              Inspect anything.
              <br />
              Explain everything.
            </p>
          </div>

          <div className="flex flex-col items-center gap-6 md:items-end">
            <nav
              aria-label="Footer"
              className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 md:justify-start"
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
              {/* Reopen the post-download install walkthrough on demand. */}
              <button
                type="button"
                onClick={openGuide}
                className="inline-flex cursor-pointer items-center gap-1.5 font-abeezee text-sm font-medium text-white/90 transition-colors hover:text-white"
              >
                <BookOpen className="size-3.5" />
                Setup guide
              </button>
              {NAV.map((item) => (
                <a
                  key={item.label}
                  href={onLanding ? item.href : `/${item.href}`}
                  onClick={handleNavClick(item.href)}
                  className="font-abeezee text-sm font-medium text-white/90 transition-colors hover:text-white"
                >
                  {item.label}
                </a>
              ))}
            </nav>

            <nav
              aria-label="Legal"
              className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 md:justify-end"
            >
              {LEGAL.map((item) => (
                <a
                  key={item.label}
                  href={item.to}
                  onClick={(e) => {
                    e.preventDefault()
                    navigate(item.to)
                  }}
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

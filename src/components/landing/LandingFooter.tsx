import { useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/format'
import { BrandMark, LpContainer } from './lp'

const NAV = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
]

// Route links (not in-page anchors).
const LEGAL = [
  { label: 'Privacy Policy', to: '/privacy' },
  { label: 'Terms & Conditions', to: '/terms' },
]

const CONTACT_EMAIL = 'hello@trysparrowcss.com'

/* The footer is rendered on the landing page and on /account, /privacy and
   /terms. `tone="light"` is the landing design (dark text on the white page);
   `tone="gradient"` keeps the white-on-blue treatment for the pages that still
   sit over the shared blue-gradient backdrop. */
export function LandingFooter({
  tone = 'light',
}: {
  tone?: 'light' | 'gradient'
}) {
  const navigate = useNavigate()
  const onLanding = useLocation().pathname === '/'
  const light = tone === 'light'

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

  const link = cn(
    'py-2.5 text-sm transition-colors lg:py-0',
    light
      ? 'text-lp-body hover:text-lp-ink'
      : 'font-medium text-white/90 hover:text-white',
  )

  return (
    <footer className="lp-root relative overflow-hidden">
      <LpContainer>
        <div
          className={cn(
            'mt-12 flex flex-col gap-5 border-t pt-7 pb-10 lg:mt-16 lg:flex-row lg:items-center lg:justify-between lg:pt-8 lg:pb-12',
            light ? 'border-[rgba(9,9,11,0.08)]' : 'border-white/25',
          )}
        >
          <div className="flex items-center gap-2.5">
            <BrandMark size={28} />
            <span
              className={cn(
                'text-base font-semibold',
                light && 'lg:hidden',
                light ? 'text-lp-ink' : 'text-white',
              )}
            >
              Sparrow
            </span>
            <span
              className={cn(
                'hidden text-sm lg:inline',
                light ? 'text-lp-muted' : 'text-white/80',
              )}
            >
              © 2026 Sparrow. All rights reserved.
            </span>
          </div>

          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-x-4 gap-y-1 lg:flex lg:gap-6"
          >
            {NAV.map((item) => (
              <a
                key={item.label}
                href={onLanding ? item.href : `/${item.href}`}
                onClick={handleNavClick(item.href)}
                className={link}
              >
                {item.label}
              </a>
            ))}
            <a href={`mailto:${CONTACT_EMAIL}`} className={cn(link, 'lg:hidden')}>
              Contact
            </a>
            {LEGAL.map((item) => (
              <a
                key={item.label}
                href={item.to}
                onClick={(e) => {
                  e.preventDefault()
                  navigate(item.to)
                }}
                className={link}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <span
            className={cn(
              'text-[13px] lg:hidden',
              light ? 'text-lp-muted' : 'text-white/80',
            )}
          >
            © 2026 Sparrow. All rights reserved.
          </span>
        </div>
      </LpContainer>

      {!light && (
        /* Oversized brand watermark behind the gradient footer */
        <span
          aria-hidden
          className="pointer-events-none block bg-linear-to-b from-white/20 to-transparent bg-clip-text text-center leading-[0.8] font-bold tracking-tight text-transparent select-none"
          style={{ fontSize: 'clamp(80px, 26vw, 420px)' }}
        >
          Sparrow
        </span>
      )}
    </footer>
  )
}

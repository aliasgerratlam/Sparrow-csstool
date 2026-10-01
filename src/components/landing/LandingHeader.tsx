import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '@/context/auth-context'
import { useExtensionDownload } from '@/hooks/use-extension-download'
import { cn } from '@/lib/format'
import { BrandMark, Icon } from './lp'

const NAV = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
]

const CONTACT_EMAIL = 'hello@trysparrowcss.com'

const NAV_LINK =
  'rounded-full px-3.5 py-2 text-sm font-medium text-lp-text transition-colors hover:bg-lp-blue/[0.08] hover:text-lp-ink'
const MOBILE_LINK =
  'block rounded-[10px] px-4 py-3.5 text-base font-medium text-lp-ink hover:bg-lp-blue/[0.08]'

export function LandingHeader() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { openLoginDialog, isAuthenticated, signOut } = useAuth()
  const { getExtension } = useExtensionDownload()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // Reused on /account, /privacy, /terms too. Those pages don't carry the
  // landing sections, so the anchors (#features …) must point back at the
  // landing page ("/#features") rather than scroll in place. `onAccount` also
  // swaps the sign-in action to Sign out (you're already on your account).
  const onAccount = pathname.startsWith('/account')
  const onLanding = pathname === '/'
  const navBase = onLanding ? '' : '/'
  const handleSignOut = () => void signOut().then(() => navigate('/'))

  // On the landing page, smooth-scroll to the section without letting the
  // browser append the "#features" hash to the URL. On the other pages the
  // anchors navigate client-side to the landing page, where RouterBridge
  // scrolls to the target section once it mounts.
  const handleNavClick = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    setOpen(false)
    if (!onLanding) {
      navigate(`/${href}`) // e.g. "/#features"
      return
    }
    document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Sign-in slot: Sign out on /account, "My account" once signed in, else Sign in.
  const accountAction =
    onAccount && isAuthenticated ? (
      <button
        type="button"
        onClick={handleSignOut}
        className={cn(
          'lp-btn hidden items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-medium text-lp-ink hover:bg-white/90 lg:inline-flex',
        )}
      >
        <LogOut className="size-4" />
        Sign out
      </button>
    ) : isAuthenticated ? (
      <a
        href="/account"
        onClick={(e) => {
          e.preventDefault()
          navigate('/account')
        }}
        className="lp-btn hidden rounded-full px-4 py-2.5 text-sm font-medium text-lp-ink transition-colors hover:bg-white/90 lg:inline-flex"
      >
        My account
      </a>
    ) : (
      <button
        type="button"
        onClick={() => openLoginDialog()}
        className="lp-btn hidden rounded-full px-4 py-2.5 text-sm font-medium text-lp-ink hover:bg-white/90 lg:inline-flex"
      >
        Sign in
      </button>
    )

  return (
    <header
      id="landing-header"
      className="lp-root fixed inset-x-0 top-0 z-50 px-5 pt-4 md:px-8 lg:pt-6"
    >
      <nav
        aria-label="Primary"
        className={cn(
          'lp-glass mx-auto flex h-14 max-w-[1200px] items-center justify-between rounded-full border border-white/85 pr-1.5 pl-3.5 shadow-[0_8px_28px_-12px_rgba(37,99,235,0.3)] transition-colors duration-300 lg:h-16 lg:pr-3 lg:pl-5',
          scrolled ? 'bg-white/75' : 'bg-white/60 lg:bg-white/55',
        )}
      >
        <a
          href={`${navBase}#home`}
          onClick={handleNavClick('#home')}
          aria-label="Sparrow home"
          className="flex items-center gap-2 text-lp-ink lg:gap-2.5"
        >
          <BrandMark size={34} />
          <span className="text-[17px] font-semibold tracking-[-0.01em] lg:text-lg">
            Sparrow
          </span>
        </a>

        {/* Desktop nav — the five links + two actions need lg; below that the
            pill carries just the install CTA and the menu button. */}
        <ul className="hidden items-center gap-1 text-sm font-medium lg:flex">
          {NAV.map((item) => (
            <li key={item.label}>
              <a
                href={`${navBase}${item.href}`}
                onClick={handleNavClick(item.href)}
                className={NAV_LINK}
              >
                {item.label}
              </a>
            </li>
          ))}
          <li>
            <a href={`mailto:${CONTACT_EMAIL}`} className={NAV_LINK}>
              Contact
            </a>
          </li>
        </ul>

        <div className="flex items-center gap-1 lg:gap-2">
          {accountAction}
          {/* Opens the extension's store listing for the visitor's browser. */}
          <button
            type="button"
            onClick={() => getExtension()}
            className="lp-btn flex h-11 items-center rounded-full bg-lp-blue px-4 text-sm font-medium text-white shadow-[0_8px_20px_-6px_rgba(37,99,235,0.55)] hover:bg-lp-blue-700 lg:px-5"
          >
            <span className="lg:hidden">Get it free</span>
            <span className="hidden lg:inline">Add to browser — free</span>
          </button>
          <button
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="landing-mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className="lp-btn flex size-11 items-center justify-center rounded-full bg-white/70 text-lp-ink lg:hidden"
          >
            <Icon name={open ? 'close' : 'menu'} size={20} />
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      <div
        id="landing-mobile-menu"
        className={cn(
          'lp-glass mx-auto mt-2 max-w-[1200px] origin-top overflow-hidden rounded-2xl border border-white/95 bg-white/85 shadow-[0_24px_48px_-16px_rgba(30,64,175,0.35)] transition-[opacity,translate,scale] duration-200 lg:hidden',
          open
            ? 'translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none -translate-y-2 scale-95 opacity-0',
        )}
        inert={!open}
      >
        <ul className="flex flex-col p-2">
          {NAV.map((item) => (
            <li key={item.label}>
              <a
                href={`${navBase}${item.href}`}
                onClick={handleNavClick(item.href)}
                className={MOBILE_LINK}
              >
                {item.label}
              </a>
            </li>
          ))}
          <li>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              onClick={() => setOpen(false)}
              className={MOBILE_LINK}
            >
              Contact
            </a>
          </li>
          <li aria-hidden="true" className="mx-2 my-1.5 h-px bg-[rgba(9,9,11,0.08)]" />
          <li>
            {onAccount && isAuthenticated ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  handleSignOut()
                }}
                className={cn(MOBILE_LINK, 'flex w-full items-center gap-2 text-lp-blue')}
              >
                <LogOut className="size-4" />
                Sign out
              </button>
            ) : isAuthenticated ? (
              <a
                href="/account"
                onClick={(e) => {
                  e.preventDefault()
                  setOpen(false)
                  navigate('/account')
                }}
                className={cn(MOBILE_LINK, 'text-lp-blue')}
              >
                My account
              </a>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  openLoginDialog()
                }}
                className={cn(MOBILE_LINK, 'w-full text-left text-lp-blue')}
              >
                Sign in
              </button>
            )}
          </li>
        </ul>
      </div>
    </header>
  )
}

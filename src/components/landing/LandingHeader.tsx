import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Wordmark } from './Wordmark'
import { ArrowButton } from './parts'
import { useAuth } from '@/context/auth-context'
import { cn } from '@/lib/format'

const NAV = [
  { label: 'Home', href: '#home' },
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
]

export function LandingHeader() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { openLoginDialog, isAuthenticated } = useAuth()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 px-4 md:px-8',
        'transition-[padding] duration-300 ease-out',
        scrolled ? 'pt-2' : 'pt-4',
      )}
    >
      <nav
        aria-label="Primary"
        className={cn(
          'mx-auto flex items-center justify-between rounded-[15px] backdrop-blur-xl backdrop-saturate-[180%]',
          'transition-[max-width,padding,background-color,box-shadow] duration-300 ease-out',
          // At the very top the pill blends into the cream page — no white box,
          // ring, or shadow. Once scrolled it lifts into a frosted white pill so
          // it stays legible over the content passing beneath it.
          scrolled
            ? 'max-w-[1120px] bg-white/75 px-4 py-2 pb-[14px] shadow-lg shadow-black/5 ring-1 ring-black/[0.06] md:px-3'
            : 'max-w-[1280px] bg-transparent px-5 py-3 md:px-4',
        )}
      >
        <div className="flex items-center gap-10">
          <a href="#home" aria-label="Sparrow home">
            <Wordmark logoHeight={36} />
          </a>

          {/* Desktop nav */}
          <ul className="hidden items-center gap-8 md:flex">
            {NAV.map((item) => (
              <li key={item.label}>
                <a
                  href={item.href}
                  className="font-abeezee text-base font-semibold text-sparrow-ink/90 transition-colors hover:text-sparrow-blue"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <ArrowButton
              variant="blue"
              href="/account"
              className="hidden px-4 py-2 text-sm md:inline-flex [&_svg]:size-4"
            >
              My account
            </ArrowButton>
          ) : (
            <ArrowButton
              variant="blue"
              onClick={openLoginDialog}
              className="hidden px-4 py-2 text-sm md:inline-flex [&_svg]:size-4"
            >
              Sign in
            </ArrowButton>
          )}
          <button
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="landing-mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex size-10 items-center justify-center rounded-[10px] text-sparrow-ink hover:bg-black/5 md:hidden"
          >
            {open ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      <div
        id="landing-mobile-menu"
        className={cn(
          'mx-auto mt-2 max-w-[1680px] overflow-hidden rounded-[15px] border border-black/5 bg-white/80 backdrop-blur-xl backdrop-saturate-[180%] transition-all md:hidden',
          open ? 'max-h-96 opacity-100' : 'pointer-events-none max-h-0 border-transparent opacity-0',
        )}
      >
        <ul className="flex flex-col gap-1 p-4">
          {NAV.map((item) => (
            <li key={item.label}>
              <a
                href={item.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2 font-abeezee text-base font-semibold text-sparrow-ink hover:bg-black/5"
              >
                {item.label}
              </a>
            </li>
          ))}
          <li>
            {isAuthenticated ? (
              <ArrowButton
                variant="blue"
                href="/account"
                className="mt-1 w-full"
              >
                My account
              </ArrowButton>
            ) : (
              <ArrowButton
                variant="blue"
                onClick={() => {
                  setOpen(false)
                  openLoginDialog()
                }}
                className="mt-1 w-full"
              >
                Sign in
              </ArrowButton>
            )}
          </li>
        </ul>
      </div>
    </header>
  )
}

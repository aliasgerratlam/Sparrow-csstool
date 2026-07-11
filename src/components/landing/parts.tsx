import type { ReactNode } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/format'

/* Shared building blocks for the Sparrow landing sections. */

export function Container({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mx-auto w-full max-w-[1280px] px-5 md:px-8', className)}>
      {children}
    </div>
  )
}

/* Pill CTA matching the Figma buttons (10px radius, trailing up-right arrow). */
export function ArrowButton({
  children,
  href = '#',
  variant = 'blue',
  arrow = true,
  glow = false,
  sparkle = false,
  className,
  onClick,
}: {
  children: ReactNode
  href?: string
  variant?: 'blue' | 'dark'
  arrow?: boolean
  glow?: boolean
  sparkle?: boolean
  className?: string
  onClick?: () => void
}) {
  const classes = cn(
    'group cursor-pointer inline-flex items-center justify-center gap-1.5 rounded-[10px] px-6 py-3 font-abeezee text-base font-semibold text-white',
    'btn-3d',
    glow
      ? 'bg-sparrow-ink cta-glow btn-3d-glow'
      : variant === 'blue'
        ? 'bg-sparrow-blue btn-3d-blue'
        : 'bg-sparrow-ink btn-3d-dark',
    sparkle && 'cta-sparkle',
    className,
  )
  const inner = (
    <>
      {sparkle && (
        <span aria-hidden className="cta-sparkles">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className="cta-sparkle-star" />
          ))}
        </span>
      )}
      {children}
      {arrow && (
        <ArrowUpRight className="size-5 transition-transform duration-200 ease-out group-hover:rotate-45" />
      )}
    </>
  )
  // A click handler means this acts as a control (e.g. opening a modal), so
  // render a <button> to avoid the anchor jumping to '#'. Otherwise stay a link.
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {inner}
      </button>
    )
  }
  return (
    <a href={href} className={classes}>
      {inner}
    </a>
  )
}

/* Neutral image placeholder (the Figma uses gray boxes for every product shot). */
export function Placeholder({
  className,
  label,
  dark = false,
}: {
  className?: string
  label?: string
  dark?: boolean
}) {
  return (
    <div
      role="img"
      aria-label={label ?? 'Product preview'}
      className={cn(
        'flex items-center justify-center rounded-[20px] rounded-t-none',
        dark ? 'bg-white/10' : 'bg-[#d9d9d9]',
        className,
      )}
    >
      {label && (
        <span
          className={cn(
            'font-abeezee text-sm font-medium',
            dark ? 'text-white/40' : 'text-black/30',
          )}
        >
          {label}
        </span>
      )}
    </div>
  )
}

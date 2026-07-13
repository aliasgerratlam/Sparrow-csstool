import { Logo } from '@/components/ui/Logo'
import { cn } from '@/lib/format'

/* Sparrow brand lockup used in the landing header and footer: the existing logo
   mark (sparoww-logo asset) paired with the "Sparrow" wordmark from the Figma. */
export function Wordmark({
  className,
  logoHeight = 80,
  dark = false,
}: {
  className?: string
  logoHeight?: number
  dark?: boolean
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Logo mark height={logoHeight} title="Sparrow" />
      <span
        className={cn(
          'font-inter text-xl font-semibold tracking-tight',
          dark ? 'text-white' : 'text-sparrow-ink',
        )}
      >
        Sparrow
      </span>
    </span>
  )
}

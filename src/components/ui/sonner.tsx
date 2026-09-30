import type { CSSProperties } from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

/* Sparrow toast stack — "Notifications & alerts" board of the extension UI
   redesign. Sonner keeps doing the hard parts (stacking, timers, swipe, a11y
   live region); `unstyled` switches off its own skin so every pixel comes from
   src/styles/sparrow-ui/alerts.css (classes below are the hooks). The fixed
   light theme and the hand-drawn icons are deliberate: the same component runs
   on the landing page and inside the extension's Shadow DOM, where no dark
   mode / icon font can be assumed. */

const svgProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

const icons: ToasterProps['icons'] = {
  success: (
    <svg {...svgProps} strokeWidth={2.5}>
      <path d="M5 12l5 5L20 7" />
    </svg>
  ),
  info: (
    <svg {...svgProps} strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  ),
  warning: (
    <svg {...svgProps} strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  error: (
    <svg {...svgProps} strokeWidth={2}>
      <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  ),
  close: (
    <svg {...svgProps} width={14} height={14} strokeWidth={2}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
}

export function Toaster({ style, ...props }: ToasterProps) {
  return (
    <Sonner
      theme="light"
      position="top-center"
      closeButton
      duration={5000}
      icons={icons}
      toastOptions={{
        unstyled: true,
        closeButtonAriaLabel: 'Dismiss',
        classNames: {
          toast: 'sp-toast',
          icon: 'sp-toast-icon',
          content: 'sp-toast-content',
          title: 'sp-toast-title',
          description: 'sp-toast-desc',
          actionButton: 'sp-toast-action',
          cancelButton: 'sp-toast-cancel',
          closeButton: 'sp-toast-close',
        },
      }}
      style={{ '--width': '392px', ...style } as CSSProperties}
      {...props}
    />
  )
}

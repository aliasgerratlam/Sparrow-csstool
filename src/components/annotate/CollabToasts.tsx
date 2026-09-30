import { useEffect } from 'react'
import { useCollab, type CollabNotification } from '@/context/collab-context'

const TOAST_TTL = 4000

/* Transient join/leave notifications shown to every participant. Each toast
   auto-dismisses; the queue lives in CollabContext (fed by presence events).
   Rendered as the design's dark "snackbar" pill, docked above the bottom bar. */
export function CollabToasts() {
  const { notifications } = useCollab()
  if (notifications.length === 0) return null
  return (
    <div className="collab-toasts" role="status" aria-live="polite">
      {notifications.map((n) => (
        <Toast key={n.id} notification={n} />
      ))}
    </div>
  )
}

const iconProps = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

/* Pick a glyph from the message so presence events read at a glance; anything
   else (expiry warnings, link notices) gets the neutral info glyph. */
function ToastIcon({ message }: { message: string }) {
  if (/\bjoined\b/i.test(message))
    return (
      <svg {...iconProps}>
        <path d="M15 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
        <circle cx="8.5" cy="7" r="3.5" />
        <path d="M19 8v6M16 11h6" />
      </svg>
    )
  if (/\bleft\b/i.test(message))
    return (
      <svg {...iconProps}>
        <path d="M15 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
        <circle cx="8.5" cy="7" r="3.5" />
        <path d="M16 11h6" />
      </svg>
    )
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  )
}

function Toast({ notification }: { notification: CollabNotification }) {
  const { dismissNotification } = useCollab()
  useEffect(() => {
    const t = setTimeout(() => dismissNotification(notification.id), TOAST_TTL)
    return () => clearTimeout(t)
  }, [notification.id, dismissNotification])
  return (
    <div className="collab-toast">
      <ToastIcon message={notification.message} />
      <span>{notification.message}</span>
    </div>
  )
}

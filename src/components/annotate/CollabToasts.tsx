import { useEffect } from 'react'
import { useCollab, type CollabNotification } from '@/context/collab-context'

const TOAST_TTL = 4000

/* Transient join/leave notifications shown to every participant. Each toast
   auto-dismisses; the queue lives in CollabContext (fed by presence events). */
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

function Toast({ notification }: { notification: CollabNotification }) {
  const { dismissNotification } = useCollab()
  useEffect(() => {
    const t = setTimeout(() => dismissNotification(notification.id), TOAST_TTL)
    return () => clearTimeout(t)
  }, [notification.id, dismissNotification])
  return <div className="collab-toast">{notification.message}</div>
}

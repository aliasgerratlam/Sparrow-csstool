import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Bell, CheckCheck, MapPin, MessageSquare } from 'lucide-react'
import { useAnnotationUI } from '@/context/annotation-ui-context'
import { useAnnotations, store } from '@/hooks/use-annotations'
import { useNotifications } from '@/hooks/use-notifications'
import { markAllSeen } from '@/lib/reply-seen'
import { authorHue, authorInitials, fmtDate, fmtReplyTime } from '@/lib/format'
import { Button } from '@/components/ui/button'

/* ─────────────────────────────────────────────────────────────────────────
   Toolbar notification bell — unread count for other people's pins and replies,
   plus a popover of the latest activity. Picking a row jumps to that annotation.

   Hand-rolled popover, deliberately NOT Radix: the repo has no Popover primitive,
   and (like the sidebar's AnnotationFilter) a portaled Radix layer leaks clicks
   past the scanner's isScannerUI guard into the annotate handler, which drops a
   stray draft pin. Living inside #scanner-toolbar keeps every click whitelisted.
───────────────────────────────────────────────────────────────────────── */

export function NotificationBell({
  onRequireAuth,
}: {
  /** Wraps the trigger so a signed-out extension click routes to login instead
   *  (mirrors the Review/Share buttons). */
  onRequireAuth: (action: () => void) => () => void
}) {
  const ui = useAnnotationUI()
  const items = useAnnotations()
  const { items: feed, unreadCount } = useNotifications()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const numbers = useMemo(() => store.displayNumbers(items), [items])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: Event) => {
      const wrap = wrapRef.current
      if (!wrap) return
      // composedPath(), not contains(e.target): in the extension the scanner
      // lives in a Shadow DOM, so a document-level event is retargeted to the
      // shadow host and contains() would call our own rows "outside" — closing
      // the popover on pointerdown before the row's click can land.
      const path = (e as Event & { composedPath?: () => EventTarget[] })
        .composedPath?.()
      const inside = path ? path.includes(wrap) : wrap.contains(e.target as Node)
      if (!inside) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // While the popover is open it OWNS Escape. ScannerController's Escape
      // handler falls through to s.disable() in annotate mode with no card open,
      // so without this the first Escape would tear the whole scanner down.
      // Capture on document beats that handler's bubble-phase listener, so
      // stopPropagation reliably keeps it from firing.
      e.stopPropagation()
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  // Same select-and-reveal pair the sidebar rows and pins use. Opening the card
  // is what marks the pin + its replies seen (see AnnotationCard), and for a
  // reply it also auto-expands the thread and flashes the new messages.
  const go = (item: (typeof feed)[number]) => {
    setOpen(false)
    ui.openCard(item.ann.id)
    ui.focusAnnotation(item.ann)
  }

  return (
    <div className="annot-notif" ref={wrapRef}>
      <Button
        id="scanner-notif-btn"
        variant="ghost"
        title="Notifications"
        aria-label={
          unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'
        }
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onRequireAuth(() => setOpen((o) => !o))}
      >
        <Bell size={15} strokeWidth={2.25} />
        {unreadCount > 0 && (
          <span className="scanner-notif-count">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="annot-notif-pop" role="menu">
          <div className="annot-notif-head">
            <span className="annot-notif-title">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                className="annot-notif-mark"
                onClick={() => markAllSeen(items, store.myDisplayName(ui.author))}
              >
                <CheckCheck className="size-3.5" aria-hidden="true" />
                Mark all read
              </button>
            )}
          </div>

          {feed.length === 0 ? (
            <div className="annot-notif-empty">
              <Bell className="size-5" aria-hidden="true" />
              <span>No activity yet</span>
              <small>New pins and replies from your collaborators land here.</small>
            </div>
          ) : (
            <div className="annot-notif-list">
              {feed.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  className={
                    'annot-notif-item' + (item.unread ? ' is-unread' : '')
                  }
                  onClick={() => go(item)}
                >
                  <span
                    className="annot-avatar"
                    style={
                      { '--av-h': String(authorHue(item.author)) } as CSSProperties
                    }
                    aria-hidden="true"
                  >
                    {authorInitials(item.author)}
                  </span>
                  <span className="annot-notif-body">
                    <span className="annot-notif-line">
                      <strong>{item.author || 'Anonymous'}</strong>
                      {item.kind === 'reply' ? ' replied on ' : ' added pin '}
                      <span className="annot-notif-ref">
                        #{numbers.get(item.ann.id) ?? '?'}
                      </span>
                    </span>
                    <span className="annot-notif-text">
                      {item.kind === 'reply'
                        ? item.reply?.message
                        : item.ann.comment || 'No description'}
                    </span>
                  </span>
                  <span className="annot-notif-meta">
                    {item.kind === 'reply' ? (
                      <MessageSquare className="size-3" aria-hidden="true" />
                    ) : (
                      <MapPin className="size-3" aria-hidden="true" />
                    )}
                    {item.at && (
                      <span title={fmtDate(item.at)}>{fmtReplyTime(item.at)}</span>
                    )}
                  </span>
                  {item.unread && <span className="annot-notif-dot" aria-hidden="true" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

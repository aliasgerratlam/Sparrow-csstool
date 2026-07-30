import { useMemo } from 'react'
import { useAnnotationUI } from '@/context/annotation-ui-context'
import { useAnnotations, store } from '@/hooks/use-annotations'
import { useReplySeen } from '@/hooks/use-reply-seen'
import { isPinUnseen, unreadReplyIds } from '@/lib/reply-seen'
import type { Annotation, Reply } from '@/lib/types'

/* ─────────────────────────────────────────────────────────────────────────
   Notification feed for the toolbar bell — other people's pins and replies,
   newest first, each flagged read/unread.

   DERIVED, not evented. store.subscribe() carries no payload (a local add, a
   remote add, a reply append and a status flip all collapse into one signal) and
   hydrateFromDb() bulk-inserts on every realtime reconnect, so an "on new row →
   queue a notification" design would burst on every reconnect and lose its queue
   on reload. Recomputing from the current list + the localStorage seen-ledgers
   instead makes the feed reload-durable and reconnect-safe for free.
───────────────────────────────────────────────────────────────────────── */

/** How many rows the popover shows. `unreadCount` is NOT capped by this. */
const FEED_LIMIT = 20

export interface NotificationItem {
  /** Stable React key: the reply id, or 'pin:' + annotation id. */
  key: string
  kind: 'pin' | 'reply'
  ann: Annotation
  /** Set only for kind === 'reply'. */
  reply?: Reply
  author: string
  /** ISO time this activity happened — what the feed sorts on. */
  at: string
  unread: boolean
}

export interface NotificationFeed {
  items: NotificationItem[]
  unreadCount: number
}

export function useNotifications(): NotificationFeed {
  const items = useAnnotations()
  const ui = useAnnotationUI()
  // Bumped on any seen-ledger write (card opened, "mark all read"). It's a memo
  // dep, not just a re-render trigger — the read/unread flags below are computed
  // from the ledgers, which the `items` reference can't see change.
  const seenVersion = useReplySeen()

  // Recomputed every render, so a role change (which re-renders via the store
  // subscription) invalidates the memo through this value.
  const me = store.myDisplayName(ui.author)

  return useMemo(() => {
    const feed: NotificationItem[] = []
    let unreadCount = 0

    for (const ann of items) {
      // One call per annotation, not per reply: unreadReplyIds() returns the
      // trailing slice of others' replies, so a Set lookup covers the thread.
      const unreadIds = new Set(unreadReplyIds(ann, me))

      if ((ann.author || '').trim() !== me) {
        const unread = isPinUnseen(ann, me)
        if (unread) unreadCount++
        feed.push({
          key: 'pin:' + ann.id,
          kind: 'pin',
          ann,
          author: ann.author,
          at: ann.createdAt,
          unread,
        })
      }

      for (const reply of ann.replies || []) {
        if ((reply.author || '').trim() === me) continue
        const unread = unreadIds.has(reply.id)
        if (unread) unreadCount++
        feed.push({
          key: reply.id,
          kind: 'reply',
          ann,
          reply,
          author: reply.author,
          at: reply.createdAt,
          unread,
        })
      }
    }

    feed.sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0))
    return { items: feed.slice(0, FEED_LIMIT), unreadCount }
  }, [items, me, seenVersion])
}

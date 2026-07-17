import { useSyncExternalStore } from 'react'
import { subscribe, getVersion } from '@/lib/reply-seen'

/** Reactive binding to the reply-seen ledger. Returns a version number that
    changes whenever seen-state is updated; components call it purely to
    re-render when the unread-reply state changes (e.g. a card is opened). */
export function useReplySeen(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion)
}

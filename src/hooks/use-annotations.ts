import { useEffect, useReducer, useSyncExternalStore } from 'react'
import * as store from '@/store/annotations-store'
import type { Annotation, Counts, Role } from '@/lib/types'

/** Live, reactive view of the annotation list (re-renders on any store write). */
export function useAnnotations(): Annotation[] {
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}

/** Derived counts from the reactive list. */
export function useAnnotationCounts(): Counts {
  const items = useAnnotations()
  let open = 0
  let resolved = 0
  items.forEach((a) => {
    if (a.status === 'Resolved') resolved++
    else if (a.status === 'Open') open++
  })
  return { total: items.length, open, resolved }
}

/** Reactive view of the store role (author vs client review mode). */
export function useRole(): Role {
  return useSyncExternalStore(store.subscribe, store.getRole)
}

/** Live view of the per-domain / 24h annotation quota ("used / cap · resets in
    …"). Re-renders on ANY store notify — including a quota-only refresh, which
    doesn't change the `items` snapshot (so useSyncExternalStore alone wouldn't
    catch it) — AND ticks on a 1-minute timer so the reset countdown stays fresh
    while a card is open. */
export function useAnnotationQuota(): ReturnType<typeof store.annotationQuota> {
  const [, tick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => store.subscribe(tick), [])
  useEffect(() => {
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])
  return store.annotationQuota()
}

export { store }

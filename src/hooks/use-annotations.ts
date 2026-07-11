import { useSyncExternalStore } from 'react'
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

export { store }

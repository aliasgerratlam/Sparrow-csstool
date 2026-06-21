import { store } from '@/hooks/use-annotations'
import { decode } from '@/lib/share-codec'

const SHARE_PREFIX = '#anr1='

export interface BootResult {
  clientMode: boolean
}

/* Initialize the annotation store before first render. Share links boot into
   read-only client review mode; otherwise load the author's saved annotations. */
export function bootStore(): BootResult {
  const hash = location.hash || ''
  if (hash.indexOf(SHARE_PREFIX) === 0) {
    const items = decode(hash.slice(SHARE_PREFIX.length))
    if (items) {
      store.setRole('client')
      store.seedFromShare(items)
      store.applyClientOverlay()
      return { clientMode: true }
    }
  }
  store.load()
  return { clientMode: false }
}

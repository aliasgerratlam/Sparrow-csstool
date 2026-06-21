import { store } from '@/hooks/use-annotations'
import { PinLayer } from './PinLayer'
import { AnnotationCard } from './AnnotationCard'
import { ReviewSidebar } from './ReviewSidebar'
import { ShareDialog } from './ShareDialog'
import { ClientBanner } from './ClientBanner'

/* Annotation surfaces — mounted at app level so they work both with the
   scanner active and in standalone client review mode. */
export function AnnotationLayer({ clientMode }: { clientMode: boolean }) {
  const isClient = clientMode || store.getRole() === 'client'
  return (
    <>
      {isClient && <ClientBanner />}
      <PinLayer />
      <AnnotationCard />
      <ReviewSidebar />
      <ShareDialog />
    </>
  )
}

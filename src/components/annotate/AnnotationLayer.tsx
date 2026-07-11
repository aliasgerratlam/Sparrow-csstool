import { useRole } from '@/hooks/use-annotations'
import { useCollab } from '@/context/collab-context'
import { PinLayer } from './PinLayer'
import { CursorLayer } from './CursorLayer'
import { EditingLayer } from './EditingLayer'
import { AnnotationCard } from './AnnotationCard'
import { ReviewSidebar } from './ReviewSidebar'
import { ClientBanner } from './ClientBanner'
import { SessionEndedBanner } from './SessionEndedBanner'
import { CollabToasts } from './CollabToasts'

/* Annotation surfaces — mounted at app level so they work with the scanner
   active and when joining a live session via a share link. */
export function AnnotationLayer() {
  const isClient = useRole() === 'client'
  const { sessionEnded, isHost } = useCollab()
  return (
    <>
      {isClient && !sessionEnded && <ClientBanner />}
      {sessionEnded && !isHost && <SessionEndedBanner />}
      <PinLayer />
      <CursorLayer />
      <EditingLayer />
      <AnnotationCard />
      <ReviewSidebar />
      <CollabToasts />
    </>
  )
}

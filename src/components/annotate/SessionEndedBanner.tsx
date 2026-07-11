import { useRef } from 'react'
import { useBodyTopInset } from '@/hooks/use-body-top-inset'

/* Banner shown to a joiner whose share link is invalid, expired, or ended —
   without it the page is silently dead (no pins, no cursors, no explanation). */
export function SessionEndedBanner() {
  const ref = useRef<HTMLDivElement>(null)
  useBodyTopInset(ref)
  return (
    <div ref={ref} className="annot-client-banner annot-session-ended">
      ⚠ This share link has ended or expired. Ask the person who shared it for
      a new link.
    </div>
  )
}

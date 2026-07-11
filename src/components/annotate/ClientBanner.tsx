import { useRef } from 'react'
import { useBodyTopInset } from '@/hooks/use-body-top-inset'

/* Banner shown when the page is opened from a share link (client review mode). */
export function ClientBanner() {
  const ref = useRef<HTMLDivElement>(null)
  useBodyTopInset(ref)
  return (
    <div ref={ref} className="annot-client-banner">
      👁 Client Review Mode — reply, set status &amp; preview. Original
      annotations are read-only.
    </div>
  )
}

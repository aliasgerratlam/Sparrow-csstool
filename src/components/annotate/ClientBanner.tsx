import { useRef } from 'react'
import { useBodyTopInset } from '@/hooks/use-body-top-inset'

/* Banner shown when the page is opened from a share link (client review mode).
   Same notice recipe as the thread's "Client Mode on" row in the design, docked
   across the top of the page. */
export function ClientBanner() {
  const ref = useRef<HTMLDivElement>(null)
  useBodyTopInset(ref)
  return (
    <div ref={ref} className="annot-client-banner" role="status">
      <span className="annot-banner-icon" aria-hidden="true">
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      </span>
      <span className="annot-banner-text">
        <b>Client Review Mode</b> — reply, set status &amp; preview. Original
        annotations are read-only.
      </span>
    </div>
  )
}

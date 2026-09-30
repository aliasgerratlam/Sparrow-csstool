import { useRef } from 'react'
import { useBodyTopInset } from '@/hooks/use-body-top-inset'

/* Banner shown to a joiner whose share link is invalid, expired, or ended —
   without it the page is silently dead (no pins, no cursors, no explanation). */
export function SessionEndedBanner() {
  const ref = useRef<HTMLDivElement>(null)
  useBodyTopInset(ref)
  return (
    <div
      ref={ref}
      className="annot-client-banner annot-session-ended"
      role="alert"
    >
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
          <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      </span>
      <span className="annot-banner-text">
        <b>This share link has ended or expired.</b> Ask the person who shared
        it for a new link.
      </span>
    </div>
  )
}

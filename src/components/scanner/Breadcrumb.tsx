import { useMemo } from 'react'
import { getElementBreadcrumb } from '@/lib/extractors'

/* Chevron-separated ancestor breadcrumb; the inspected element is a blue pill. */
export function Breadcrumb({ element }: { element: Element | null }) {
  const parts = useMemo(
    () => (element ? getElementBreadcrumb(element) : []),
    [element],
  )

  if (!element || !parts.length) {
    return (
      <span id="panel-breadcrumb">
        <span className="bc-seg active">Hover an element</span>
      </span>
    )
  }

  return (
    <span id="panel-breadcrumb">
      {parts.map((part, i) => (
        <span key={i} style={{ display: 'contents' }}>
          {i > 0 && <span className="bc-sep">›</span>}
          <span className={'bc-seg' + (i === parts.length - 1 ? ' active' : '')}>
            {part}
          </span>
        </span>
      ))}
    </span>
  )
}

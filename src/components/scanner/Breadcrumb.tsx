import { useMemo } from 'react'
import { getElementBreadcrumb } from '@/lib/extractors'

/* The elements behind the breadcrumb's (non-ellipsis) segments, root → element.
   Mirrors the walk in getElementBreadcrumb so the two stay index-aligned. */
function breadcrumbElements(element: Element): Element[] {
  const els: Element[] = []
  let cur: Element | null = element
  while (cur && cur.tagName && cur.tagName.toLowerCase() !== 'html') {
    els.unshift(cur)
    if (cur.tagName.toLowerCase() === 'body') break
    cur = cur.parentElement
    if (els.length >= 4) break
  }
  return els
}

/* Slash-separated ancestor path; the inspected element is a blue pill. Ancestors
   are buttons: clicking one inspects it instead (freezes it), and the leading
   ellipsis reveals the full DOM path. */
export function Breadcrumb({
  element,
  onSelect,
  onShowPath,
}: {
  element: Element | null
  onSelect?: (el: Element) => void
  onShowPath?: () => void
}) {
  // Keep the path short like the design: … / parent / current. Anything further
  // up lives behind the ellipsis (the hover tip shows the whole chain).
  const { parts, els } = useMemo(() => {
    if (!element) return { parts: [] as string[], els: [] as Element[] }
    const all = getElementBreadcrumb(element)
    const real = all.filter((p) => p !== '…')
    const realEls = breadcrumbElements(element)
    const truncated = all[0] === '…' || real.length > 3
    const keep = Math.min(real.length, truncated ? 3 : real.length)
    return {
      parts: truncated ? ['…', ...real.slice(-keep)] : real,
      els: realEls.slice(-keep),
    }
  }, [element])

  if (!element || !parts.length) {
    return (
      <nav id="panel-breadcrumb" aria-label="Element path">
        <span className="sp-ip-bc-current">Hover an element</span>
      </nav>
    )
  }

  let elIdx = 0
  return (
    <nav id="panel-breadcrumb" aria-label="Element path">
      {parts.map((part, i) => {
        const isEllipsis = part === '…'
        const target = isEllipsis ? null : els[elIdx++]
        const isLast = i === parts.length - 1
        return (
          <span key={i} className="sp-ip-bc-item">
            {i > 0 && (
              <span className="sp-ip-bc-sep" aria-hidden="true">
                /
              </span>
            )}
            {isEllipsis ? (
              <button
                type="button"
                className="sp-ip-btn sp-ip-ghost sp-ip-bc-btn sp-ip-bc-more"
                aria-label="Show full path"
                onClick={onShowPath}
                onFocus={onShowPath}
              >
                …
              </button>
            ) : isLast ? (
              <span className="sp-ip-bc-current" aria-current="page" title={part}>
                {part}
              </span>
            ) : (
              <button
                type="button"
                className="sp-ip-btn sp-ip-ghost sp-ip-bc-btn"
                title={`Inspect ${part}`}
                onClick={() => target && onSelect?.(target)}
              >
                {part}
              </button>
            )}
          </span>
        )
      })}
    </nav>
  )
}

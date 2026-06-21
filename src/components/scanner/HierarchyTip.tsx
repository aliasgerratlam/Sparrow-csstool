import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getFullHierarchy } from '@/lib/extractors'

/* DOM-hierarchy tooltip shown under the panel header on hover. */
export function HierarchyTip({
  element,
  anchorRect,
}: {
  element: Element | null
  anchorRect: DOMRect | null
}) {
  const tipRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: 0,
    top: 0,
  })

  const chain = useMemo(
    () => (element ? getFullHierarchy(element) : []),
    [element],
  )

  useLayoutEffect(() => {
    const tip = tipRef.current
    if (!tip || !anchorRect) return
    const margin = 8
    let left = anchorRect.left
    let top = anchorRect.bottom + 6
    if (left + tip.offsetWidth > window.innerWidth - margin)
      left = Math.max(margin, window.innerWidth - tip.offsetWidth - margin)
    if (top + tip.offsetHeight > window.innerHeight - margin)
      top = Math.max(margin, anchorRect.top - tip.offsetHeight - 6) // flip above
    setPos({ left, top })
  }, [anchorRect, chain])

  if (!element || !anchorRect || !chain.length) return null

  return (
    <div
      id="panel-hierarchy-tip"
      ref={tipRef}
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="hier-title">DOM Hierarchy</div>
      {chain.map((node, i) => {
        const tag = node.tagName.toLowerCase()
        const cls = Array.from(node.classList).filter(
          (c) => !c.startsWith('scanner-'),
        )
        return (
          <div
            key={i}
            className={'hier-row' + (node === element ? ' is-target' : '')}
          >
            {i > 0 && (
              <span className="hier-indent">{'  '.repeat(i - 1) + '└ '}</span>
            )}
            <span className="hier-tag">{tag}</span>
            {node.id && <span className="hier-id">#{node.id}</span>}
            {cls.length > 0 && (
              <span className="hier-class">.{cls.join('.')}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

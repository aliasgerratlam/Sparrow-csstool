import { useCallback, useEffect, useRef, useState } from 'react'

export interface DragPosition {
  top: number
  left: number
}

/* Make a panel draggable by a handle. Returns the current position (or null
   while docked via CSS), a pointer-down handler for the handle, and whether a
   drag is in progress. Position is clamped to the viewport. */
export function useDraggable(panelRef: React.RefObject<HTMLElement | null>) {
  const [pos, setPos] = useState<DragPosition | null>(null)
  const [dragging, setDragging] = useState(false)
  const offset = useRef({ x: 0, y: 0 })

  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const panel = panelRef.current
      if (!panel) return
      const rect = panel.getBoundingClientRect()
      offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      setPos({ top: rect.top, left: rect.left })
      setDragging(true)
      e.preventDefault()
    },
    [panelRef],
  )

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: PointerEvent) => {
      const panel = panelRef.current
      if (!panel) return
      let left = e.clientX - offset.current.x
      let top = e.clientY - offset.current.y
      left = Math.max(0, Math.min(left, window.innerWidth - panel.offsetWidth))
      top = Math.max(0, Math.min(top, window.innerHeight - panel.offsetHeight))
      setPos({ top, left })
    }
    const onUp = () => setDragging(false)
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
  }, [dragging, panelRef])

  const resetPosition = useCallback(() => setPos(null), [])

  return { pos, dragging, onHandlePointerDown, resetPosition }
}

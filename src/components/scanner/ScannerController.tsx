import { useEffect, useRef } from 'react'
import { useScanner } from '@/context/scanner-context'
import { useAnnotationUI } from '@/context/annotation-ui-context'
import * as preview from '@/lib/preview'

const SCANNER_UI_SELECTORS = [
  '#scanner-toolbar',
  '#scanner-panel',
  // Color-dropper panel — so hovering it doesn't highlight the panel itself and
  // its copy-button clicks reach React instead of being swallowed below.
  '#scanner-dropper-panel',
  '#scanner-highlight',
  '#mode-rail',
  '#cta-btn',
  '#annot-sidebar',
  '#annot-card',
  '#annot-pin-layer',
  // Radix portals dropdowns/popovers to <body>, outside the sidebar. Without
  // this, clicking a filter-menu item leaks to the annotate handler and creates
  // a stray annotation pinned to the menu (which then orphans itself).
  '[data-radix-popper-content-wrapper]',
  // The share Dialog is also portalled to <body>. Without these, clicking the
  // share button, the copy field, or the backdrop leaks to the scanner handler
  // and opens the inspector panel instead of operating the modal.
  '[data-slot="dialog-content"]',
  '[data-slot="dialog-overlay"]',
]

function isScannerUI(el: Element): boolean {
  if (!el.closest) return false
  if (SCANNER_UI_SELECTORS.some((sel) => el.closest(sel))) return true
  return !!(el.classList && el.classList.contains('annot-client-banner'))
}

/* Installs the document-level capture listeners that drive the scanner.
   Reads the latest scanner/UI state through a ref so listeners bind once. */
export function ScannerController() {
  const scanner = useScanner()
  const ui = useAnnotationUI()
  const ref = useRef({ scanner, ui })
  ref.current = { scanner, ui }

  const { isActive, mode } = scanner

  // Document event wiring + body offset, installed while active.
  useEffect(() => {
    if (!isActive) return
    document.body.style.paddingTop = '44px'

    let raf = 0
    let pending: Element | null = null

    const onMouseOver = (e: Event) => {
      const { scanner: s, ui: u } = ref.current
      if (!s.isActive) return
      // Dropper uses the native picker — it never reads the hovered element, so
      // skip the per-move setHovered re-renders (keeps hovering/scrolling smooth).
      if (s.mode === 'dropper') return
      // Ruler keeps tracking the cursor even with an anchor frozen, so it can
      // measure from the anchor to whatever you point at next.
      if (s.frozen && s.mode !== 'ruler') return
      const el = e.target as Element
      if (isScannerUI(el)) return
      if (s.mode === 'annotate' && u.cardOpen) return // keep highlight fixed
      pending = el
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (pending) ref.current.scanner.setHovered(pending)
      })
    }

    const onClick = (e: MouseEvent) => {
      const { scanner: s, ui: u } = ref.current
      if (!s.isActive) return
      const el = e.target as Element
      // Clicks on scanner chrome (incl. the dropper panel's copy buttons) flow
      // through to their React handlers.
      if (isScannerUI(el)) return
      e.preventDefault()
      e.stopPropagation()
      // Ruler: click to anchor the element you measure from; click it again to
      // release. Hovering then measures the gap from the anchor to the target.
      if (s.mode === 'ruler') {
        if (s.frozen && s.selectedEl === el) s.unfreeze()
        else s.freeze(el)
        return
      }
      if (s.mode === 'annotate') {
        s.setHovered(el)
        u.openDraft(el)
        return
      }
      // Dropper: page clicks neither inspect nor freeze — sampling happens via
      // the native picker (the panel's "Pick" button).
      if (s.mode === 'dropper') return
      if (s.frozen && s.selectedEl === el) {
        s.unfreeze()
        return
      }
      s.freeze(el)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const { scanner: s, ui: u } = ref.current
      if (u.cardOpen) {
        u.closeCard()
        return
      }
      if (s.frozen) s.unfreeze()
      else s.disable()
    }

    document.addEventListener('mouseover', onMouseOver, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      document.body.style.paddingTop = ''
      document.removeEventListener('mouseover', onMouseOver, true)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isActive])

  // Annotate-mode cursor + leaving-mode cleanup.
  useEffect(() => {
    if (isActive && mode === 'annotate') {
      document.body.classList.add('annot-cursor')
    } else {
      document.body.classList.remove('annot-cursor')
    }
    if (mode !== 'annotate') {
      ref.current.ui.closeCard()
      preview.revertAll()
    }
  }, [isActive, mode])

  // Full teardown when the scanner transitions active → inactive. Guarded so it
  // does not run on initial mount (which would close the client-review sidebar).
  const wasActive = useRef(false)
  useEffect(() => {
    if (isActive) {
      wasActive.current = true
      return
    }
    if (!wasActive.current) return
    wasActive.current = false
    ref.current.ui.closeCard()
    ref.current.ui.closeSidebar()
    preview.revertAll()
    document.body.classList.remove('annot-cursor')
  }, [isActive])

  return null
}

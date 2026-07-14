import { useEffect, useRef } from 'react'
import { useScanner } from '@/context/scanner-context'
import { useAnnotationUI } from '@/context/annotation-ui-context'
import { useAuth } from '@/context/auth-context'
import {
  isElementPickActive,
  pickElement,
  stopElementPick,
} from '@/lib/element-refont'
import { store } from '@/hooks/use-annotations'
import * as preview from '@/lib/preview'

const SCANNER_UI_SELECTORS = [
  // Browser-extension build: the whole scanner lives in a Shadow DOM whose host
  // is this element. Composed events from inside the shadow retarget to the host
  // at the document-level listeners here, so matching it keeps the tool's own
  // clicks/hovers from being treated as page inspection. (Absent in the web app,
  // where the chrome is in the light DOM and the ids below match directly.)
  '#sparrow-scan-root',
  '#scanner-toolbar',
  '#scanner-panel',
  // Color-dropper / font panels — so hovering them doesn't highlight the panel
  // itself and their button clicks reach React instead of being swallowed below.
  '#scanner-dropper-panel',
  '#scanner-font-panel',
  '#scanner-assets-panel',
  '#scanner-highlight',
  '#mode-rail',
  // The Assets tool downloads files by clicking a synthetic <a download>
  // appended to <body> (see lib/download.ts). preventDefault() below would
  // cancel the download, so let that click flow.
  '.scanner-download-anchor',
  '#cta-btn',
  // The landing hero's Try/Stop Demo toggle — same role as #cta-btn on the
  // marketing page: its click must reach React (toggle the scanner) instead of
  // being swallowed as an inspect/freeze.
  '.scanner-demo-toggle',
  // The fixed landing header sits on top of the page while the demo inspects it.
  // Whitelist its interactive controls (Sign in / My account / nav links / the
  // hamburger) so their clicks reach React instead of being swallowed — the rest
  // of the header (and page) stays inspectable. Scoped to a/button so it doesn't
  // block inspecting the header's layout itself.
  '#landing-header a',
  '#landing-header button',
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

/* Clerk's hosted sign-in/up modal portals into <body> with cl-* classes.
   While it is up the scanner must stand down entirely: no hover tracking
   (the panel would reopen behind the modal), no click capture (it would
   swallow the form's clicks), and Esc belongs to the modal. */
function isAuthModalOpen(): boolean {
  return !!document.querySelector('.cl-modalBackdrop')
}

/* Installs the document-level capture listeners that drive the scanner.
   Reads the latest scanner/UI state through a ref so listeners bind once. */
export function ScannerController() {
  const scanner = useScanner()
  const ui = useAnnotationUI()
  const auth = useAuth()
  const ref = useRef({ scanner, ui, auth })
  ref.current = { scanner, ui, auth }

  const { isActive, mode } = scanner

  // Document event wiring + body offset, installed while active.
  useEffect(() => {
    if (!isActive) return

    let raf = 0
    let pending: Element | null = null

    const onMouseOver = (e: Event) => {
      const { scanner: s, ui: u, auth: a } = ref.current
      if (!s.isActive) return
      if (isAuthModalOpen()) return
      // Dropper (Colors) and Assets are whole-page overviews — they don't
      // read the hovered element, so don't track hover or show the
      // highlighter. Fonts is too, except while its "select text" pick mode
      // is armed: then it tracks hover exactly like inspect so the
      // highlighter shows the pick.
      if (s.mode === 'dropper' || s.mode === 'assets') return
      if (s.mode === 'fonts' && !isElementPickActive()) return
      // Ruler keeps tracking the cursor even with an anchor frozen, so it can
      // measure from the anchor to whatever you point at next.
      if (s.frozen && s.mode !== 'ruler') return
      const el = e.target as Element
      if (isScannerUI(el)) return
      // Annotate is auth-gated: while the user is unauthenticated (login modal
      // up, or dismissed) don't track hover, so the highlighter doesn't run
      // behind the modal. Resumes automatically once isAuthenticated flips.
      if (s.mode === 'annotate' && a.isConfigured && !a.isAuthenticated) return
      if (s.mode === 'annotate' && u.cardOpen) return // keep highlight fixed
      pending = el
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        // Re-validate: a click may have frozen the selection (or the mode may
        // have changed) between scheduling and this frame — don't clobber it.
        const cur = ref.current.scanner
        if (cur.frozen && cur.mode !== 'ruler') return
        if (cur.mode === 'dropper' || cur.mode === 'assets') return
        if (pending) cur.setHovered(pending)
      })
    }

    const onClick = (e: MouseEvent) => {
      const { scanner: s, ui: u, auth: a } = ref.current
      if (!s.isActive) return
      if (isAuthModalOpen()) return // let the modal's own clicks flow
      const el = e.target as Element
      // Clicks on scanner chrome (incl. the dropper panel's copy buttons) flow
      // through to their React handlers.
      if (isScannerUI(el)) return
      e.preventDefault()
      e.stopPropagation()
      // Re-linking an orphaned annotation: the next page click rewrites that
      // annotation's selector to the picked element, regardless of mode.
      if (u.relinkId) {
        u.completeRelink(el)
        return
      }
      // Ruler: click to anchor the element you measure from; click it again to
      // release. Hovering then measures the gap from the anchor to the target.
      if (s.mode === 'ruler') {
        if (s.frozen && s.selectedEl === el) s.unfreeze()
        else s.freeze(el)
        return
      }
      if (s.mode === 'annotate') {
        // Backstop the auth gate: any path into annotate mode requires login.
        if (a.isConfigured && !a.isAuthenticated) {
          s.unfreeze()
          s.setHovered(null)
          a.openLoginDialog()
          return
        }
        // Clients (share-link joiners) can't create annotations — the store
        // would reject the add, so don't open a draft that can never submit.
        // They interact through pins and the sidebar instead.
        if (store.getRole() === 'client') return
        s.setHovered(el)
        u.openDraft(el)
        return
      }
      // Fonts: with pick mode armed, this click chooses the element whose
      // font gets replaced (the FontPanel opens a picker for it); otherwise
      // the tool is a page-wide overview and ignores page clicks.
      if (s.mode === 'fonts') {
        if (isElementPickActive()) {
          pickElement(el)
          s.setHovered(null)
        }
        return
      }
      // Dropper (Colors) and Assets show page-wide overviews, so they ignore
      // page clicks entirely — nothing to select.
      if (s.mode === 'dropper' || s.mode === 'assets') return
      // Inspect: click freezes the element (so you can move to the panel to
      // copy), click it again to release.
      if (s.frozen && s.selectedEl === el) {
        s.unfreeze()
        return
      }
      s.freeze(el)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (isAuthModalOpen()) return // Esc closes the modal, not the scanner
      // An open dialog (e.g. Share) owns Esc — closing it must not also
      // unfreeze/disable the scanner underneath.
      if (document.querySelector('[data-slot="dialog-content"]')) return
      const { scanner: s, ui: u } = ref.current
      if (u.relinkId) {
        u.cancelRelink()
        return
      }
      // Font pick mode: Esc disarms it without leaving the Fonts tool.
      if (isElementPickActive()) {
        stopElementPick()
        s.setHovered(null)
        return
      }
      if (u.cardOpen) {
        u.closeCard()
        return
      }
      if (s.frozen) {
        s.unfreeze()
        return
      }
      // Overview/measure tools: first Esc returns to Inspect instead of
      // tearing the whole scanner down; a second Esc (from Inspect) exits.
      if (
        s.mode === 'dropper' ||
        s.mode === 'fonts' ||
        s.mode === 'assets' ||
        s.mode === 'ruler'
      ) {
        s.setMode('inspect')
        s.setHovered(null)
        return
      }
      s.disable()
    }

    document.addEventListener('mouseover', onMouseOver, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      if (raf) cancelAnimationFrame(raf)
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

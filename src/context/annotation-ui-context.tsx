import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { getUniqueSelector, resolve } from '@/lib/selector-engine'
import * as preview from '@/lib/preview'
import { store } from '@/hooks/use-annotations'
import type { Annotation } from '@/lib/types'

/* ─────────────────────────────────────────────────────────────────────────
   AnnotationUIContext — shared UI state for the annotation layer: which card
   is open (saved view vs unsaved draft), sidebar/share visibility, the shared
   author name, and the "focus/flash an element" action used by pins + list.
───────────────────────────────────────────────────────────────────────── */

interface AnnotationUIValue {
  // Card
  activeId: string | null
  draft: Annotation | null
  cardOpen: boolean
  openCard: (id: string) => void
  openDraft: (el: Element) => void
  updateDraft: (patch: Partial<Annotation>) => void
  submitDraft: () => void
  closeCard: () => void
  // Sidebar
  sidebarOpen: boolean
  toggleSidebar: () => void
  openSidebar: () => void
  closeSidebar: () => void
  // Share
  shareOpen: boolean
  setShareOpen: (open: boolean) => void
  // Author (mirrored between toolbar + panel name fields)
  author: string
  setAuthor: (v: string) => void
  // Focus/flash an element on the page
  flashEl: Element | null
  focusAnnotation: (ann: Annotation) => void
  // Transient highlight when hovering a pin (works in client mode too)
  hoverPinEl: Element | null
  setHoverPinEl: (el: Element | null) => void
}

const AnnotationUIContext = createContext<AnnotationUIValue | null>(null)

export function AnnotationUIProvider({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Annotation | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [author, setAuthor] = useState('')
  const [flashEl, setFlashEl] = useState<Element | null>(null)
  const [hoverPinEl, setHoverPinEl] = useState<Element | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const authorRef = useRef(author)
  authorRef.current = author
  // Refs mirror state so callbacks can run store/preview side effects directly
  // (never inside a setState updater, which would run during render).
  const draftRef = useRef(draft)
  draftRef.current = draft
  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId

  const closeCard = useCallback(() => {
    const d = draftRef.current
    if (d) preview.revert(d.id)
    const id = activeIdRef.current
    // Safety net: drop a submitted annotation the user emptied out.
    if (id != null && store.getRole() === 'author') {
      const ann = store.get(id)
      if (ann && !ann.comment.trim()) {
        preview.revert(id)
        store.remove(id)
      }
    }
    setDraft(null)
    setActiveId(null)
  }, [])

  const openCard = useCallback((id: string) => {
    const d = draftRef.current
    if (d) preview.revert(d.id)
    setDraft(null)
    setActiveId(id)
  }, [])

  const openDraft = useCallback((el: Element) => {
    const prev = draftRef.current
    if (prev) preview.revert(prev.id)
    setDraft({
      id: store.newId(),
      pageUrl: '',
      selector: getUniqueSelector(el),
      comment: '',
      category: 'General',
      status: 'Open',
      author: authorRef.current.trim(),
      createdAt: '',
      styling: store.defaultStyling(),
      suggestedChanges: {},
      replies: [],
    })
    setActiveId(null)
  }, [])

  const updateDraft = useCallback((patch: Partial<Annotation>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d))
  }, [])

  const submitDraft = useCallback(() => {
    const d = draftRef.current
    if (!d) return
    preview.revert(d.id)
    store.add({
      selector: d.selector,
      comment: d.comment,
      category: d.category,
      author: d.author,
      styling: d.styling,
      suggestedChanges: d.suggestedChanges,
    })
    setDraft(null)
    setActiveId(null)
  }, [])

  const toggleSidebar = useCallback(() => setSidebarOpen((o) => !o), [])
  const openSidebar = useCallback(() => setSidebarOpen(true), [])
  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  const focusAnnotation = useCallback((ann: Annotation) => {
    const el = resolve(ann.selector)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (flashTimer.current) clearTimeout(flashTimer.current)
    setFlashEl(el)
    flashTimer.current = setTimeout(() => setFlashEl(null), 1600)
  }, [])

  const value = useMemo<AnnotationUIValue>(
    () => ({
      activeId,
      draft,
      cardOpen: activeId != null || draft != null,
      openCard,
      openDraft,
      updateDraft,
      submitDraft,
      closeCard,
      sidebarOpen,
      toggleSidebar,
      openSidebar,
      closeSidebar,
      shareOpen,
      setShareOpen,
      author,
      setAuthor,
      flashEl,
      focusAnnotation,
      hoverPinEl,
      setHoverPinEl,
    }),
    [
      activeId,
      draft,
      openCard,
      openDraft,
      updateDraft,
      submitDraft,
      closeCard,
      sidebarOpen,
      toggleSidebar,
      openSidebar,
      closeSidebar,
      shareOpen,
      author,
      flashEl,
      focusAnnotation,
      hoverPinEl,
    ],
  )

  return (
    <AnnotationUIContext value={value}>{children}</AnnotationUIContext>
  )
}

export function useAnnotationUI(): AnnotationUIValue {
  const ctx = useContext(AnnotationUIContext)
  if (!ctx)
    throw new Error('useAnnotationUI must be used within AnnotationUIProvider')
  return ctx
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAnnotationUI } from '@/context/annotation-ui-context'
import { useScanner } from '@/context/scanner-context'
import {
  useAnnotations,
  useAnnotationCounts,
  useRole,
  store,
} from '@/hooks/use-annotations'
import { resolve } from '@/lib/selector-engine'
import { fmtDate } from '@/lib/format'
import { STATUSES } from '@/store/annotations-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Check,
  Filter,
  Link2,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { Logo } from '@/components/ui/Logo'
import type { Annotation } from '@/lib/types'

/* Lightweight status filter. Deliberately NOT a Radix Select: Select always
   mounts RemoveScroll + a DismissableLayer that portals to <body> and disables
   outside pointer events. That portaling leaked clicks past the sidebar into the
   annotate handler (stray draft pins) and the scroll-lock reflowed the drawer.
   This menu lives inside #annot-sidebar, so every click is caught by the
   scanner's isScannerUI guard, and it overlays (absolute) instead of reflowing. */
function StatusFilter({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: Event) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () =>
      document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open])

  const options = [
    { value: 'all', label: 'All status' },
    ...STATUSES.map((s) => ({ value: s, label: s })),
  ]

  return (
    <div className="annot-filter" ref={wrapRef}>
      <button
        type="button"
        className={'annot-filter-trigger' + (value !== 'all' ? ' is-active' : '')}
        aria-label="Filter by status"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={'Filter: ' + (value === 'all' ? 'All statuses' : value)}
        onClick={() => setOpen((o) => !o)}
      >
        <Filter className="size-4" />
      </button>
      {open && (
        <div className="annot-filter-menu" role="listbox">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={value === opt.value}
              className={
                'annot-filter-opt' + (value === opt.value ? ' is-selected' : '')
              }
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
            >
              <span>{opt.label}</span>
              {value === opt.value && <Check className="size-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ReviewSidebar() {
  const ui = useAnnotationUI()
  const scanner = useScanner()
  const items = useAnnotations()
  const counts = useAnnotationCounts()
  const [fStatus, setFStatus] = useState<string>('all')
  const [search, setSearch] = useState('')

  const role = useRole()

  // Derive the display numbers and filtered rows once per data/filter change —
  // this component still re-renders on hover (it reads scanner state), so the
  // memo keeps the per-annotation selector resolution off the hover path.
  const rows = useMemo(() => {
    const numbers = store.displayNumbers(items)
    const matches = (ann: Annotation): boolean => {
      if (fStatus !== 'all' && ann.status !== fStatus) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          (ann.comment || '').toLowerCase().indexOf(q) < 0 &&
          (ann.author || '').toLowerCase().indexOf(q) < 0
        )
          return false
      }
      return true
    }
    return items
      .map((ann, idx) => ({ ann, num: numbers.get(ann.id) ?? idx + 1 }))
      .filter((x) => matches(x.ann))
      .map((x) => ({ ...x, resolved: !!resolve(x.ann.selector) }))
  }, [items, fStatus, search])

  if (!ui.sidebarOpen) return null

  const isAuthor = role === 'author'

  // Re-link: drop into annotate-style picking so the next page click rewrites
  // this annotation's selector. Works whether or not the scanner was active.
  const beginRelink = (id: string) => {
    if (!scanner.isActive) scanner.enable()
    scanner.setMode('annotate')
    if (scanner.frozen) scanner.unfreeze()
    ui.startRelink(id)
  }

  const deleteAnnotation = (id: string) => {
    if (!window.confirm('Delete this annotation? This cannot be undone.')) return
    if (ui.activeId === id) ui.closeCard()
    store.remove(id)
  }

  const listed = rows.filter((r) => r.resolved)
  const orphans = rows.filter((r) => !r.resolved)

  const renderItem = ({
    ann,
    num,
    resolved,
  }: {
    ann: Annotation
    num: number
    resolved: boolean
  }) => {
    const missing = !resolved
    const editable = store.canEdit(ann, ui.author)
    return (
    <div
      key={ann.id}
      className={'annot-li' + (missing ? ' orphan' : '')}
      onClick={() => {
        ui.openCard(ann.id)
        ui.focusAnnotation(ann)
      }}
    >
      <span
        className={
          'annot-li-num ' + (ann.status === 'Resolved' ? 'resolved' : 'open')
        }
      >
        {num}
      </span>
      <div className="annot-li-body">
        <div className="annot-li-comment">{ann.comment || '(no comment)'}</div>
        <div className="annot-li-meta">
          <span
            className={
              'annot-badge st-' + (ann.status === 'Resolved' ? 'resolved' : 'open')
            }
          >
            {ann.status}
          </span>
          {ann.createdAt && (
            <span className="annot-li-date">{fmtDate(ann.createdAt)}</span>
          )}
          {ann.author && <span className="annot-li-author">{ann.author}</span>}
        </div>
      </div>
      <div className="annot-li-actions">
        {editable && !missing && (
          <Button
            variant="ghost"
            className="annot-li-action edit"
            aria-label="Edit this comment"
            title="Edit this comment"
            onClick={(e) => {
              e.stopPropagation()
              ui.openCardForEdit(ann.id)
              ui.focusAnnotation(ann)
            }}
          >
            <Pencil className="size-4" />
          </Button>
        )}
        {missing && isAuthor && (
          <Button
            variant="ghost"
            className="annot-li-action relink"
            aria-label="Re-link — pick the element this comment should point to"
            title="Re-link — pick the element this comment should point to"
            onClick={(e) => {
              e.stopPropagation()
              beginRelink(ann.id)
            }}
          >
            <Link2 className="size-4" />
          </Button>
        )}
        {ann.status === 'Resolved' ? (
          <Button
            variant="ghost"
            className="annot-li-action reopen"
            aria-label="Reopen — bring the pin back to the page"
            title="Reopen — bring the pin back to the page"
            onClick={(e) => {
              e.stopPropagation()
              store.setStatus(ann.id, 'Open')
            }}
          >
            <RotateCcw className="size-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            className="annot-li-action resolve"
            aria-label="Resolve — mark this comment as done"
            title="Resolve — mark this comment as done"
            onClick={(e) => {
              e.stopPropagation()
              store.setStatus(ann.id, 'Resolved')
            }}
          >
            <Check className="size-4" />
          </Button>
        )}
        {isAuthor && (
          <Button
            variant="ghost"
            className="annot-li-del"
            aria-label="Delete annotation"
            title="Delete this annotation"
            onClick={(e) => {
              e.stopPropagation()
              deleteAnnotation(ann.id)
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
    </div>
    )
  }

  return (
    <div id="annot-sidebar" className="open">
      <div className="annot-sb-head">
        <Logo height={30} title="Sparrow" />
        <Button
          variant="ghost"
          className="annot-sb-close"
          aria-label="Close review panel"
          onClick={ui.closeSidebar}
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="annot-sb-counts">
        <div className="annot-stat total">
          <b>{counts.total}</b>
          <span>Total</span>
        </div>
        <div className="annot-stat open">
          <b>{counts.open}</b>
          <span>Open</span>
        </div>
        <div className="annot-stat resolved">
          <b>{counts.resolved}</b>
          <span>Resolved</span>
        </div>
      </div>
      <div className="annot-sb-filters">
        <div className="annot-sb-search">
          <Search className="annot-sb-search-icon size-4" />
          <Input
            type="text"
            placeholder="Search comments…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <StatusFilter value={fStatus} onChange={setFStatus} />
      </div>
      {ui.relinkId && (
        <div className="annot-relink-banner">
          <Link2 className="size-4" />
          <span>Click an element on the page to re-link · Esc to cancel</span>
          <button
            type="button"
            className="annot-relink-cancel"
            onClick={ui.cancelRelink}
          >
            Cancel
          </button>
        </div>
      )}
      <div className="annot-sb-list">
        {listed.length ? (
          listed.map(renderItem)
        ) : orphans.length === 0 ? (
          <div className="annot-empty">No annotations match.</div>
        ) : null}
      </div>
      {orphans.length > 0 && (
        <div className="annot-sb-orphan-wrap">
          <div className="annot-sb-orphan-title">
            Orphaned ({orphans.length}) — element not found
          </div>
          <div className="annot-sb-orphan-list">{orphans.map(renderItem)}</div>
        </div>
      )}
    </div>
  )
}

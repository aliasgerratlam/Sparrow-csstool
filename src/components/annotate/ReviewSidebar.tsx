import { useEffect, useRef, useState } from 'react'
import { useAnnotationUI } from '@/context/annotation-ui-context'
import { useAnnotations, useAnnotationCounts, store } from '@/hooks/use-annotations'
import { resolve } from '@/lib/selector-engine'
import { fmtDate } from '@/lib/format'
import { STATUSES } from '@/store/annotations-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Check, Filter, MessageSquare, RotateCcw, Search, X } from 'lucide-react'
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
  const items = useAnnotations()
  const counts = useAnnotationCounts()
  const [fStatus, setFStatus] = useState<string>('all')
  const [search, setSearch] = useState('')

  if (!ui.sidebarOpen) return null

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

  const rows = items
    .map((ann, idx) => ({ ann, num: idx + 1 }))
    .filter((x) => matches(x.ann))
    .map((x) => ({ ...x, resolved: !!resolve(x.ann.selector) }))

  const listed = rows.filter((r) => r.resolved)
  const orphans = rows.filter((r) => !r.resolved)

  const renderItem = ({ ann, num }: { ann: Annotation; num: number }) => (
    <div
      key={ann.id}
      className={'annot-li' + (resolve(ann.selector) ? '' : ' orphan')}
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
      {ann.status === 'Resolved' ? (
        <Button
          variant="ghost"
          className="annot-li-action reopen"
          title="Reopen — bring the pin back to the page"
          onClick={(e) => {
            e.stopPropagation()
            store.setStatus(ann.id, 'Open')
          }}
        >
          <RotateCcw className="size-3.5" />
          Reopen
        </Button>
      ) : (
        <Button
          variant="ghost"
          className="annot-li-action resolve"
          title="Resolve — mark this comment as done"
          onClick={(e) => {
            e.stopPropagation()
            store.setStatus(ann.id, 'Resolved')
          }}
        >
          <Check className="size-3.5" />
          Resolve
        </Button>
      )}
    </div>
  )

  return (
    <div id="annot-sidebar" className="open">
      <div className="annot-sb-head">
        <div className="annot-sb-head-left">
          <span className="annot-sb-icon">
            <MessageSquare className="size-4" />
          </span>
          <span className="annot-sb-title">Review</span>
        </div>
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

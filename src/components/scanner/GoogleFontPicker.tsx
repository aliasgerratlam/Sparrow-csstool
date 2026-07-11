import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Check, Search, Trash2, Upload } from 'lucide-react'
import {
  addCustomFont,
  getCustomFonts,
  removeCustomFont,
  subscribeCustomFonts,
  CUSTOM_FONT_EXTENSIONS,
  type CustomFont,
} from '@/lib/custom-fonts'
import {
  loadGoogleFontsList,
  loadPreviewFont,
  type GoogleFont,
} from '@/lib/google-fonts'
import type { ReplacementFont } from '@/lib/site-refont'

/* Google Fonts picker — the full ~1,900-family catalog with search + category
   filter, plus a "Your fonts" section for user-uploaded font files
   (.ttf/.otf/.woff/.woff2, registered in-browser via FontFace — see
   custom-fonts.ts). The catalog JSON is a lazy chunk fetched on first open;
   the list is windowed by hand (fixed row height, slice by scrollTop) so only
   visible rows mount, and each mounted row lazy-loads a tiny name-subset
   stylesheet after a short dwell so its label renders in its own typeface. */

const ROW_H = 34
const LIST_H = 230
const OVERSCAN = 4

const CATEGORY_LABELS: Record<string, string> = {
  'sans-serif': 'Sans-serif',
  serif: 'Serif',
  display: 'Display',
  handwriting: 'Handwriting',
  monospace: 'Monospace',
}

function PickerRow({
  font,
  top,
  active,
  disabled,
  onPick,
}: {
  font: GoogleFont
  top: number
  active: boolean
  disabled: boolean
  onPick: (f: GoogleFont) => void
}) {
  // Debounced preview load: only rows that stay visible ~150ms fetch their
  // name-subset stylesheet, so flinging the scrollbar doesn't spray requests.
  useEffect(() => {
    const t = window.setTimeout(() => loadPreviewFont(font.family), 150)
    return () => window.clearTimeout(t)
  }, [font.family])

  return (
    <button
      type="button"
      className={'sfont-item' + (active ? ' active' : '')}
      style={{ top }}
      disabled={disabled}
      onClick={() => onPick(font)}
      title={`Replace with ${font.family}`}
    >
      <span className="sfont-item-name" style={{ fontFamily: `"${font.family}"` }}>
        {font.family}
      </span>
      {active ? (
        <Check size={13} aria-hidden="true" />
      ) : (
        <span className="sfont-item-cat">{CATEGORY_LABELS[font.category] ?? font.category}</span>
      )}
    </button>
  )
}

/* One uploaded font: pickable like a catalog row, with a remove button. The
   family is already registered via FontFace, so the label renders in it. */
function CustomFontRow({
  font,
  active,
  disabled,
  onPick,
}: {
  font: CustomFont
  active: boolean
  disabled: boolean
  onPick: (f: CustomFont) => void
}) {
  return (
    <div className={'sfont-custom-row' + (active ? ' active' : '')}>
      <button
        type="button"
        className="sfont-custom-pick"
        disabled={disabled}
        onClick={() => onPick(font)}
        title={`Replace with ${font.family}`}
      >
        <span className="sfont-item-name" style={{ fontFamily: `"${font.family}"` }}>
          {font.family}
        </span>
        {active ? (
          <Check size={13} aria-hidden="true" />
        ) : (
          <span className="sfont-item-cat">{font.fileName}</span>
        )}
      </button>
      <button
        type="button"
        className="sfont-custom-remove"
        onClick={() => removeCustomFont(font.family)}
        title={`Remove ${font.family}`}
        aria-label={`Remove ${font.family}`}
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}

/* "Your fonts": upload button + the uploaded-font rows. Reads the shared
   custom-fonts store so every picker instance shows the same list. */
function CustomFontSection({
  current,
  disabled,
  onPick,
}: {
  current: string | null
  disabled: boolean
  onPick: (f: CustomFont) => void
}) {
  const customFonts = useSyncExternalStore(subscribeCustomFonts, getCustomFonts)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    setError(null)
    for (const file of Array.from(files)) {
      try {
        await addCustomFont(file)
      } catch (e) {
        setError(e instanceof Error ? e.message : `Couldn't load "${file.name}"`)
      }
    }
    setUploading(false)
  }

  return (
    <div className="sfont-custom">
      <div className="sfont-custom-head">
        <span className="sfont-custom-label">Your fonts</span>
        <button
          type="button"
          className="sfont-upload-btn"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={12} aria-hidden="true" />
          {uploading ? 'Loading…' : 'Upload font'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={CUSTOM_FONT_EXTENSIONS.join(',')}
          multiple
          hidden
          onChange={(e) => {
            void onFiles(e.target.files)
            e.target.value = '' // allow re-uploading the same file
          }}
        />
      </div>
      {error && <div className="sfont-upload-error">{error}</div>}
      {customFonts.map((f) => (
        <CustomFontRow
          key={f.family}
          font={f}
          active={current === f.family}
          disabled={disabled}
          onPick={onPick}
        />
      ))}
    </div>
  )
}

export function GoogleFontPicker({
  current,
  disabled,
  onPick,
}: {
  /** Family currently overriding this font (checkmark), or null. */
  current: string | null
  /** True while an apply is in flight — rows are inert. */
  disabled: boolean
  onPick: (f: ReplacementFont) => void
}) {
  const [catalog, setCatalog] = useState<GoogleFont[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [scrollTop, setScrollTop] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    loadGoogleFontsList().then(
      (list) => alive && setCatalog(list),
      () => alive && setFailed(true),
    )
    return () => {
      alive = false
    }
  }, [])

  const matches = useMemo(() => {
    if (!catalog) return []
    const q = query.trim().toLowerCase()
    return catalog.filter(
      (f) =>
        (category === 'all' || f.category === category) &&
        (!q || f.family.toLowerCase().includes(q)),
    )
  }, [catalog, query, category])

  // Reset scroll when the filter changes so the window matches scrollTop 0.
  const onFilterChange = () => {
    setScrollTop(0)
    if (listRef.current) listRef.current.scrollTop = 0
  }

  const customSection = (
    <CustomFontSection current={current} disabled={disabled} onPick={onPick} />
  )

  if (failed) {
    return (
      <div className="sfont-picker">
        {customSection}
        <div className="dropper-empty">Couldn't load the Google Fonts list</div>
      </div>
    )
  }
  if (!catalog) {
    return (
      <div className="sfont-picker">
        {customSection}
        <div className="dropper-empty">Loading Google Fonts…</div>
      </div>
    )
  }

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const end = Math.min(matches.length, Math.ceil((scrollTop + LIST_H) / ROW_H) + OVERSCAN)

  return (
    <div className="sfont-picker">
      {customSection}
      <div className="sfont-controls">
        <span className="sfont-search">
          <Search size={12} aria-hidden="true" />
          <input
            type="text"
            value={query}
            placeholder="Search Google Fonts…"
            onChange={(e) => {
              setQuery(e.target.value)
              onFilterChange()
            }}
            aria-label="Search Google Fonts"
          />
        </span>
        <select
          className="sfont-cat"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value)
            onFilterChange()
          }}
          aria-label="Filter by category"
        >
          <option value="all">All</option>
          <option value="sans-serif">Sans-serif</option>
          <option value="serif">Serif</option>
          <option value="display">Display</option>
          <option value="handwriting">Handwriting</option>
          <option value="monospace">Monospace</option>
        </select>
      </div>

      {matches.length === 0 ? (
        <div className="dropper-empty">No fonts match “{query}”</div>
      ) : (
        <div
          ref={listRef}
          className="sfont-list"
          style={{ height: Math.min(LIST_H, matches.length * ROW_H) }}
          onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        >
          <div className="sfont-list-spacer" style={{ height: matches.length * ROW_H }}>
            {matches.slice(start, end).map((f, i) => (
              <PickerRow
                key={f.family}
                font={f}
                top={(start + i) * ROW_H}
                active={current === f.family}
                disabled={disabled}
                onPick={onPick}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

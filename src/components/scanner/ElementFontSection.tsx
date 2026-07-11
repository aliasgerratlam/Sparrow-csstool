import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ChevronDown, Loader2, MousePointerClick, RotateCcw, X } from 'lucide-react'
import { useScanner } from '@/context/scanner-context'
import {
  applyElementFont,
  getElementRefontState,
  removeElementTarget,
  resetElementFont,
  startElementPick,
  stopElementPick,
  subscribeElementRefont,
} from '@/lib/element-refont'
import type { ReplacementFont } from '@/lib/site-refont'
import { GoogleFontPicker } from './GoogleFontPicker'

/* "Selected text" section of the Fonts panel — arm pick mode, click any text
   on the page, and change the font of just that element (subtree included;
   see element-refont.ts). Each picked element becomes a row with the same
   Google-Fonts-or-upload picker the site-wide rows use. */
export function ElementFontSection() {
  const { picking, targets } = useSyncExternalStore(
    subscribeElementRefont,
    getElementRefontState,
  )
  const { setHovered } = useScanner()
  const [openId, setOpenId] = useState<number | null>(null)
  const [applyingId, setApplyingId] = useState<number | null>(null)

  // Crosshair affordance while armed; drop it (and the armed state) when the
  // panel unmounts — switching tools shouldn't leave a live page-click trap.
  useEffect(() => {
    document.body.classList.toggle('refont-pick-cursor', picking)
    return () => document.body.classList.remove('refont-pick-cursor')
  }, [picking])
  useEffect(() => () => stopElementPick(), [])

  // Auto-expand the picker for a freshly picked element.
  const prevCount = useRef(targets.length)
  useEffect(() => {
    const last = targets[targets.length - 1]
    if (last && targets.length > prevCount.current) {
      setOpenId(last.id)
    }
    prevCount.current = targets.length
  }, [targets])

  const togglePick = () => {
    if (picking) {
      stopElementPick()
      setHovered(null)
    } else {
      startElementPick()
    }
  }

  const onPick = (id: number, rf: ReplacementFont) => {
    setApplyingId(id)
    void applyElementFont(id, rf).finally(() => setApplyingId(null))
  }

  return (
    <div className="sfont-elsec">
      <div className="sfont-elsec-head">
        <span className="sfont-elsec-label">Selected text</span>
        <button
          type="button"
          className={'sfont-pick-btn' + (picking ? ' picking' : '')}
          onClick={togglePick}
          title={picking ? 'Cancel selecting (Esc)' : 'Pick an element on the page'}
        >
          <MousePointerClick size={12} aria-hidden="true" />
          {picking ? 'Click any text… (Esc)' : 'Select text'}
        </button>
      </div>

      {targets.length === 0 && !picking && (
        <p className="sfont-elsec-hint">
          Change one element's font instead of the whole page.
        </p>
      )}

      {targets.map((t) => {
        const open = openId === t.id
        const applying = applyingId === t.id
        return (
          <div className="sfont-entry" key={t.id}>
            <div
              className={'sfont-row' + (open ? ' open' : '')}
              onClick={(e) => {
                if ((e.target as Element).closest('.site-reset-btn')) return
                setOpenId((k) => (k === t.id ? null : t.id))
              }}
              title="Click to choose a replacement font"
            >
              <span className="sfont-meta">
                <span className="sfont-name-line">
                  <span className="sfont-el-tag">{t.label}</span>
                  <span className="sfont-name sfont-el-family">{t.originalFamily}</span>
                  {t.family != null && (
                    <span className="sfont-override">→ {t.family}</span>
                  )}
                </span>
              </span>
              {applying ? (
                <span className="sfont-spinner" aria-label="Applying font">
                  <Loader2 size={14} />
                </span>
              ) : (
                <span className="sfont-el-actions">
                  {t.family != null && (
                    <button
                      type="button"
                      className="site-reset-btn"
                      onClick={() => resetElementFont(t.id)}
                      title="Revert this element"
                      aria-label="Revert this element"
                    >
                      <RotateCcw size={13} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="site-reset-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeElementTarget(t.id)
                    }}
                    title="Revert and remove from this list"
                    aria-label="Revert and remove from this list"
                  >
                    <X size={13} />
                  </button>
                  <span
                    className={'sfont-chevron' + (open ? ' open' : '')}
                    aria-hidden="true"
                  >
                    <ChevronDown size={14} />
                  </span>
                </span>
              )}
            </div>
            {open && (
              <GoogleFontPicker
                current={t.family}
                disabled={applying}
                onPick={(rf) => onPick(t.id, rf)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

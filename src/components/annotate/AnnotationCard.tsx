import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useAnnotationUI } from '@/context/annotation-ui-context'
import { useAnnotations, useAnnotationCounts, store } from '@/hooks/use-annotations'
import { useElementRect } from '@/hooks/use-element-rect'
import { resolve } from '@/lib/selector-engine'
import { fmtDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { Annotation } from '@/lib/types'

const CARD_BGS = ['#ffffff', '#f7a8a0', '#f8cf6b', '#84dda6', '#2f80ff']

function cardColorOf(ann: Annotation): string {
  const bg = ann.styling?.background
  return bg && bg !== 'transparent' ? bg : '#ffffff'
}

// Lightened, translucent tint so dark text stays readable over the blur.
function softTint(hex: string): string {
  if (typeof hex !== 'string' || hex[0] !== '#' || hex.length !== 7)
    return hex || '#ffffff'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const mix = (v: number) => Math.round(v + (255 - v) * 0.62)
  return `rgba(${mix(r)},${mix(g)},${mix(b)},0.66)`
}

export function AnnotationCard() {
  const ui = useAnnotationUI()
  const items = useAnnotations()
  const counts = useAnnotationCounts()
  const cardRef = useRef<HTMLDivElement>(null)
  const commentRef = useRef<HTMLTextAreaElement>(null)
  const [replyText, setReplyText] = useState('')
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  const ro = store.getRole() === 'client'

  const ann: Annotation | null =
    ui.draft ??
    (ui.activeId ? (items.find((a) => a.id === ui.activeId) ?? null) : null)
  const isDraft = ui.draft != null && ann != null && ann.id === ui.draft.id

  const targetEl = useMemo(
    () => (ann ? resolve(ann.selector) : null),
    [ann],
  )
  const targetRect = useElementRect(targetEl)

  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    if (targetRect) {
      let left = targetRect.left
      let top = targetRect.bottom + 12
      left = Math.max(12, Math.min(left, window.innerWidth - card.offsetWidth - 12))
      top = Math.max(56, Math.min(top, window.innerHeight - card.offsetHeight - 12))
      setPos({ left, top })
    } else {
      setPos({ left: window.innerWidth - card.offsetWidth - 20, top: 70 })
    }
  }, [targetRect, ann?.id])

  // Focus the comment box as soon as the card opens for an annotation, and
  // place the caret at the end so reopening an existing comment doesn't strand
  // the cursor at position 0.
  useEffect(() => {
    if (!ann || ro) return
    const ta = commentRef.current
    if (!ta) return
    ta.focus()
    const end = ta.value.length
    ta.setSelectionRange(end, end)
  }, [ann?.id, ro])

  if (!ann) return null

  const num = (isDraft ? counts.total : store.index(ann.id)) + 1
  const current = cardColorOf(ann)
  const canSubmit = !!ann.comment.trim()

  const setBackground = (color: string) => {
    const styling = { ...(ann.styling ?? store.defaultStyling()), background: color }
    if (isDraft) ui.updateDraft({ styling })
    else store.update(ann.id, { styling })
  }

  const onComment = (value: string) => {
    if (isDraft) ui.updateDraft({ comment: value })
    else store.update(ann.id, { comment: value })
  }

  const toggleResolve = () => {
    const next = ann.status === 'Resolved' ? 'Open' : 'Resolved'
    store.setStatus(ann.id, next)
    if (next === 'Resolved') ui.closeCard()
  }

  const sendReply = () => {
    const msg = replyText.trim()
    if (!msg) return
    store.addReply(ann.id, {
      author: ui.author.trim() || (ro ? 'Client' : 'Author'),
      message: msg,
    })
    setReplyText('')
  }

  const replies = ann.replies || []

  return (
    <div
      id="annot-card"
      ref={cardRef}
      style={{
        left: pos?.left ?? 'auto',
        top: pos?.top ?? 70,
        background: softTint(current),
      }}
    >
      <div className="annot-card-head">
        <span className="annot-card-num">#{num}</span>
        <span
          className={'annot-badge st-' + (ann.status === 'Resolved' ? 'resolved' : 'open')}
        >
          {ann.status}
        </span>
        {!ro && (
          <div className="annot-bg-swatches annot-head-swatches">
            {CARD_BGS.map((color) => (
              <Button
                key={color}
                variant="ghost"
                className={
                  'annot-bg-swatch' +
                  (color.toLowerCase() === current.toLowerCase() ? ' selected' : '')
                }
                title={'Background ' + color}
                style={{ background: color }}
                onClick={() => setBackground(color)}
              />
            ))}
          </div>
        )}
        <div className="annot-card-actions">
          {!isDraft && (
            <Button
              variant="ghost"
              className={
                'annot-head-btn annot-resolve-btn' +
                (ann.status === 'Resolved' ? ' on' : '')
              }
              title={ann.status === 'Resolved' ? 'Reopen' : 'Mark as resolved'}
              onClick={toggleResolve}
            >
              {ann.status === 'Resolved' ? (
                <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" fill="currentColor" />
                  <path
                    d="M8 12.5l2.5 2.5L16 9"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path
                    d="M8 12.5l2.5 2.5L16 9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </Button>
          )}
          {!isDraft && !ro && (
            <Button
              variant="ghost"
              className="annot-head-btn annot-trash-btn"
              title="Delete annotation"
              onClick={() => {
                store.remove(ann.id)
                ui.closeCard()
              }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M9 3a1 1 0 0 0-1 1v1H4v2h1l1 13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-13h1V5h-4V4a1 1 0 0 0-1-1H9zm1 2h4v0h-4zm-1.9 4h1.8l.5 10H8.6l-.5-10zm3.9 0h1.8l-.5 10h-.8l-.5-10zm3.9 0h1.8l-.5 10h-1.3l.5-10z"
                />
              </svg>
            </Button>
          )}
          <Button
            variant="ghost"
            className="annot-head-btn annot-card-close"
            title="Close"
            onClick={ui.closeCard}
          >
            ✕
          </Button>
        </div>
      </div>

      <div className="annot-card-body">
        <div className={'annot-target' + (targetEl ? '' : ' orphan')}>
          {targetEl
            ? '⌖ ' + (ann.selector?.tag || 'element')
            : '⚠ element not found on this page'}
        </div>

        {ro ? (
          <>
            <div className="annot-field">
              <label>Comment</label>
              <div className="annot-readonly">{ann.comment || '—'}</div>
            </div>
            <div className="annot-field">
              <label>Author</label>
              <div className="annot-readonly">{ann.author || '—'}</div>
            </div>
          </>
        ) : (
          <Textarea
            ref={commentRef}
            className="annot-input annot-comment-input"
            rows={4}
            placeholder="Add a comment here…"
            value={ann.comment}
            onChange={(e) => onComment(e.target.value)}
          />
        )}

        {!isDraft && (
          <details className="annot-section" open>
            <summary>Replies ({replies.length})</summary>
            <div className="annot-replies">
              {replies.length ? (
                replies.map((r) => (
                  <div key={r.id} className="annot-reply">
                    <div className="annot-reply-head">
                      <strong>{r.author || 'Anonymous'}</strong>
                      <span className="annot-reply-date">{fmtDate(r.createdAt)}</span>
                    </div>
                    <div className="annot-reply-msg">{r.message}</div>
                  </div>
                ))
              ) : (
                <div className="annot-empty">No replies yet.</div>
              )}
            </div>
            <div className="annot-reply-input">
              <Textarea
                className="annot-input annot-reply-ta"
                rows={2}
                placeholder="Write a reply…"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
              />
              <Button
                variant="ghost"
                className="annot-reply-send"
                title="Send reply"
                onClick={sendReply}
              >
                <svg viewBox="0 0 512 512" width="13" height="13" aria-hidden="true">
                  <path fill="currentColor" d="M16 464l480-208L16 48v160l320 48-320 48z" />
                </svg>
              </Button>
            </div>
          </details>
        )}

        {!ro && isDraft && (
          <div className="annot-submit-row">
            <Button
              variant="ghost"
              className="annot-submit-btn"
              title="Submit & attach pin"
              disabled={!canSubmit}
              onClick={ui.submitDraft}
            >
              <svg viewBox="0 0 512 512" width="16" height="16" aria-hidden="true">
                <path fill="currentColor" d="M16 464l480-208L16 48v160l320 48-320 48z" />
              </svg>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useAnnotationUI } from '@/context/annotation-ui-context'
import {
  useAnnotations,
  useAnnotationCounts,
  useAnnotationQuota,
  useRole,
  store,
} from '@/hooks/use-annotations'
import { useElementRect } from '@/hooks/use-element-rect'
import { resolve } from '@/lib/selector-engine'
import { markPinSeen, markSeen, unreadReplyIds } from '@/lib/reply-seen'
import { formatReset } from '@/lib/annotation-quota-api'
import { authorHue, authorInitials, fmtDate, fmtReplyTime } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Check,
  ChevronDown,
  Loader2,
  MessageSquare,
  Pencil,
  SendHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import type { Annotation, Reply } from '@/lib/types'

const CARD_BGS = ['#ffffff', '#ef4444', '#f8cf6b', '#84dda6', '#2f80ff']

// How long the "new reply" highlight stays on: three runs of the .8s
// annotReplyFlash keyframe in index.css, plus a beat so the last pulse finishes.
const REPLY_FLASH_MS = 2600

function cardColorOf(ann: Annotation): string {
  const bg = ann.styling?.background
  return bg && bg !== 'transparent' ? bg : '#ffffff'
}

// Keep keystrokes typed into a field from reaching the host page. The scanner is
// injected over arbitrary pages (Shadow DOM in the extension), and many sites
// bind document-level keydown handlers — scroll libraries, single-key shortcuts —
// that hijack Space/arrows, preventDefault(), and scroll the page, swallowing the
// character before the field inserts it (a space scrolls the page instead of
// typing). stopPropagation keeps the default action intact (the char is still
// inserted) while the host never sees the event. Escape still bubbles so the
// scanner's Esc-to-close handler fires.
function stopKeyLeak(e: ReactKeyboardEvent) {
  if (e.key !== 'Escape') e.stopPropagation()
}

// The full, exact element address (shown on hover).
function elementAddress(sel: Annotation['selector']): string {
  if (!sel) return 'element'
  if (sel.id) return '#' + sel.id
  return sel.primary || sel.nthPath || sel.tag || 'element'
}

// A short label for the target — just the leaf element (tag + id/classes),
// stripped of positional :nth-child() noise. The full path lives in the title.
function elementLabel(sel: Annotation['selector']): string {
  if (!sel) return 'element'
  if (sel.id) return sel.tag + '#' + sel.id
  const path = sel.primary || sel.nthPath || ''
  const leaf = path.split('>').pop()?.trim()
  const clean = (leaf || sel.tag || 'element').replace(/:nth-child\(\d+\)/g, '')
  return clean || sel.tag || 'element'
}

// Near-solid pastel of the chosen swatch so ink text stays readable. White
// returns undefined — the card then keeps its Sparrow white→cream gradient
// from the stylesheet instead of a flat inline background.
function softTint(hex: string): string | undefined {
  if (typeof hex !== 'string' || hex[0] !== '#' || hex.length !== 7)
    return undefined
  if (hex.toLowerCase() === '#ffffff') return undefined
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const mix = (v: number) => Math.round(v + (255 - v) * 0.78)
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`
}

export function AnnotationCard() {
  const ui = useAnnotationUI()
  const items = useAnnotations()
  const counts = useAnnotationCounts()
  const quota = useAnnotationQuota()
  const cardRef = useRef<HTMLDivElement>(null)
  const commentRef = useRef<HTMLTextAreaElement>(null)
  const [replyText, setReplyText] = useState('')
  // Which reply (if any) is being rewritten, plus its local draft — kept out of
  // the store per-keystroke, same rationale as the comment draft above.
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  // The replies disclosure is controlled so unread replies can force it open
  // (see the reveal effect below) while manual toggling still works.
  const [repliesOpen, setRepliesOpen] = useState(false)
  // Replies that were unread when this card opened — highlighted for a moment so
  // the eye lands on them instead of scanning the whole thread.
  const [newReplyIds, setNewReplyIds] = useState<Set<string>>(new Set())
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firstNewRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [editing, setEditing] = useState(false)
  // Submitting a draft round-trips to the backend (server-authoritative quota
  // reserve + Supabase mirror), so the button shows a spinner and locks out
  // repeat clicks until it settles — otherwise a double-click burns two slots.
  const [submitting, setSubmitting] = useState(false)
  // While editing a SAVED annotation the textarea binds to this local draft, not
  // the store item — so nothing hits the DB per keystroke and a peer's realtime
  // echo can't revert what's being typed. Committed on Done/close/card-switch.
  const [commentDraft, setCommentDraft] = useState<string | null>(null)
  const commentDraftRef = useRef<string | null>(null)
  commentDraftRef.current = commentDraft

  const ro = useRole() === 'client'

  const ann: Annotation | null =
    ui.draft ??
    (ui.activeId ? (items.find((a) => a.id === ui.activeId) ?? null) : null)
  const isDraft = ui.draft != null && ann != null && ann.id === ui.draft.id
  // Only the original author (or an unattributed note) may rewrite the comment.
  const canEdit = !ro && ann != null && !isDraft && store.canEdit(ann, ui.author)

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

  // Write a pending comment edit through to the store (minimal patch, applied
  // over the CURRENT store item so concurrent remote changes to other fields
  // survive). No-ops when nothing is being edited or nothing changed.
  const commitPendingEdit = (id: string | null | undefined) => {
    const v = commentDraftRef.current
    if (id == null || v == null) return
    const cur = store.get(id)
    if (cur && v !== cur.comment) store.update(id, { comment: v })
  }

  // When switching to a different annotation, drop back to read view — but honor
  // an edit intent coming from the drawer's Edit button (open straight into edit).
  // Cleanup commits an in-progress edit so switching cards mid-edit doesn't
  // silently discard typed text.
  useEffect(() => {
    const wantsEdit =
      ui.editIntentId != null && ann != null && ui.editIntentId === ann.id
    setEditing(wantsEdit)
    setCommentDraft(wantsEdit && ann && !isDraft ? ann.comment : null)
    setEditingReplyId(null)
    setReplyDraft('')
    // Drop any unsent reply text too — it belongs to the thread we just left.
    setReplyText('')
    // Collapse the thread back down; the reveal effect below is declared after
    // this one, so on a card switch with unread replies it re-opens in the same
    // commit and wins.
    setRepliesOpen(false)
    setNewReplyIds(new Set())
    if (wantsEdit) ui.clearEditIntent()
    const prevId = ann && !isDraft ? ann.id : null
    return () => commitPendingEdit(prevId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ann?.id])

  // Focus the comment box only when it's actually editable (new draft or an
  // explicit edit), placing the caret at the end.
  useEffect(() => {
    if (!ann || ro) return
    if (!isDraft && !editing) return
    const ta = commentRef.current
    if (!ta) return
    ta.focus()
    const end = ta.value.length
    ta.setSelectionRange(end, end)
  }, [ann?.id, ro, isDraft, editing])

  // Clear the unread-reply dot for a saved annotation while its card is open —
  // both on open and if a new reply streams in while it stays open. `myReplyName`
  // (below) is the same identity used to author replies, so self-replies are
  // ignored. Drafts have no replies, so they're skipped.
  //
  // Before clearing, capture WHICH replies were unread: dismissing the pin's dot
  // is the only signal the user gets, so the thread auto-expands and the new
  // replies flash — otherwise the dot vanishes on open while the replies stay
  // collapsed and the news is lost. Safe against the broad `ann` dep: once
  // markSeen has run, unreadReplyIds() is empty, so unrelated updates to the
  // annotation (status, comment edit, our own reply) never re-flash.
  useEffect(() => {
    if (!ann || isDraft) return
    const me = store.myDisplayName(ui.author)
    const fresh = unreadReplyIds(ann, me)
    markSeen(ann, me)
    // Opening the card is also what dismisses this pin from the notification
    // bell — do it here so a pin and its replies clear together.
    markPinSeen(ann)
    if (!fresh.length) return
    setRepliesOpen(true)
    setNewReplyIds(new Set(fresh))
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setNewReplyIds(new Set()), REPLY_FLASH_MS)
  }, [ann, isDraft, ro, ui.author])

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current)
    },
    [],
  )

  // Bring the first highlighted reply into view inside the card's scroll area.
  // 'nearest' keeps it from yanking the host page (the card itself is fixed).
  useEffect(() => {
    if (!newReplyIds.size) return
    firstNewRef.current?.scrollIntoView({ block: 'nearest' })
  }, [newReplyIds])

  if (!ann) return null

  const num = isDraft
    ? counts.total + 1
    : (store.displayNumbers(items).get(ann.id) ?? store.index(ann.id) + 1)
  const current = cardColorOf(ann)
  const canSubmit = !!ann.comment.trim()

  const setBackground = (color: string) => {
    const styling = { ...(ann.styling ?? store.defaultStyling()), background: color }
    if (isDraft) ui.updateDraft({ styling })
    else store.update(ann.id, { styling })
  }

  const onComment = (value: string) => {
    if (isDraft) ui.updateDraft({ comment: value })
    else setCommentDraft(value)
  }

  const finishEdit = () => {
    commitPendingEdit(ann.id)
    setCommentDraft(null)
    setEditing(false)
  }

  const closeCard = () => {
    // Commit BEFORE closeCard — its empty-comment safety net reads the store
    // synchronously and would otherwise discard a just-typed comment.
    if (!isDraft) finishEdit()
    ui.closeCard()
  }

  const toggleResolve = () => {
    if (!isDraft) finishEdit()
    const next = ann.status === 'Resolved' ? 'Open' : 'Resolved'
    store.setStatus(ann.id, next)
    if (next === 'Resolved') ui.closeCard()
  }

  // Await the submit so the spinner covers the whole round-trip: a denied
  // reserve keeps the draft open (the cap toast explains why), so the button
  // has to come back to life rather than stay stuck.
  const submitDraft = async () => {
    if (submitting || !canSubmit) return
    setSubmitting(true)
    try {
      await ui.submitDraft()
    } finally {
      setSubmitting(false)
    }
  }

  const sendReply = () => {
    const msg = replyText.trim()
    if (!msg) return
    store.addReply(ann.id, {
      author: store.myDisplayName(ui.author),
      message: msg,
    })
    setReplyText('')
  }

  const replies = ann.replies || []
  // Oldest highlighted reply, in thread order — the one we scroll to.
  const firstNewId = replies.find((r) => newReplyIds.has(r.id))?.id ?? null

  // The identity this user's replies are stamped with (matches sendReply). A
  // reply may only be rewritten by whoever authored it.
  const myReplyName = store.myDisplayName(ui.author)
  const canEditReply = (r: Reply) => (r.author || '').trim() === myReplyName

  const startEditReply = (r: Reply) => {
    setEditingReplyId(r.id)
    setReplyDraft(r.message)
  }

  const cancelEditReply = () => {
    setEditingReplyId(null)
    setReplyDraft('')
  }

  const saveEditReply = () => {
    if (editingReplyId == null) return
    const msg = replyDraft.trim()
    if (msg) store.updateReply(ann.id, editingReplyId, { message: msg })
    cancelEditReply()
  }

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
        {(isDraft || canEdit) && (
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
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          )}
          <Button
            variant="ghost"
            className="annot-head-btn annot-card-close"
            title="Close"
            onClick={closeCard}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="annot-card-body">
        <div
          className={'annot-target' + (targetEl ? '' : ' orphan')}
          title={targetEl ? elementAddress(ann.selector) : undefined}
        >
          {targetEl
            ? '⌖ ' + elementLabel(ann.selector)
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
        ) : isDraft || editing ? (
          <div className="annot-field">
            <Textarea
              ref={commentRef}
              className="annot-input annot-comment-input"
              rows={4}
              placeholder="Add a comment here…"
              value={isDraft ? ann.comment : (commentDraft ?? ann.comment)}
              onChange={(e) => onComment(e.target.value)}
              onKeyDown={stopKeyLeak}
              onKeyUp={stopKeyLeak}
            />
            {editing && (
              <div className="annot-edit-row">
                <Button
                  variant="ghost"
                  className="annot-edit-done"
                  title="Done editing"
                  onClick={finishEdit}
                >
                  <Check className="size-3.5" />
                  Done
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="annot-field">
            <div className="annot-comment-head">
              <label>Comment</label>
              {canEdit && (
                <Button
                  variant="ghost"
                  className="annot-edit-btn"
                  title="Edit comment"
                  onClick={() => {
                    setCommentDraft(ann.comment)
                    setEditing(true)
                  }}
                >
                  <Pencil className="size-3.5" />
                  Edit
                </Button>
              )}
            </div>
            <div className="annot-readonly">{ann.comment || '—'}</div>
            {ann.author && (
              <div className="annot-comment-author">— {ann.author}</div>
            )}
          </div>
        )}

        {!isDraft && (
          <details
            className="annot-section"
            open={repliesOpen}
            onToggle={(e) => setRepliesOpen(e.currentTarget.open)}
          >
            <summary>
              <MessageSquare className="size-3.5" aria-hidden="true" />
              <span className="annot-section-title">Replies</span>
              <span
                className={
                  'annot-reply-count' + (replies.length ? '' : ' is-zero')
                }
              >
                {replies.length}
              </span>
              <ChevronDown className="size-3.5 annot-section-chev" aria-hidden="true" />
            </summary>
            <div className="annot-replies">
              {replies.length ? (
                replies.map((r) => (
                  <div
                    key={r.id}
                    ref={r.id === firstNewId ? firstNewRef : undefined}
                    className={
                      'annot-reply' +
                      (newReplyIds.has(r.id) ? ' is-new' : '') +
                      (canEditReply(r) ? ' is-mine' : '')
                    }
                  >
                    <span
                      className="annot-avatar"
                      style={{ '--av-h': String(authorHue(r.author)) } as CSSProperties}
                      aria-hidden="true"
                    >
                      {authorInitials(r.author)}
                    </span>
                    <div className="annot-reply-bubble">
                      <div className="annot-reply-head">
                        <strong>{r.author || 'Anonymous'}</strong>
                        <div className="annot-reply-meta">
                          <span
                            className="annot-reply-date"
                            title={fmtDate(r.createdAt)}
                          >
                            {fmtReplyTime(r.createdAt)}
                          </span>
                          {editingReplyId !== r.id && canEditReply(r) && (
                            <Button
                              variant="ghost"
                              className="annot-reply-edit"
                              title="Edit reply"
                              onClick={() => startEditReply(r)}
                            >
                              <Pencil className="size-3" aria-hidden="true" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {editingReplyId === r.id ? (
                        <div className="annot-reply-edit-box">
                          <Textarea
                            className="annot-input annot-reply-ta"
                            rows={2}
                            autoFocus
                            value={replyDraft}
                            onChange={(e) => setReplyDraft(e.target.value)}
                            onKeyDown={stopKeyLeak}
                            onKeyUp={stopKeyLeak}
                          />
                          <div className="annot-reply-edit-actions">
                            <Button
                              variant="ghost"
                              className="annot-reply-cancel"
                              title="Cancel"
                              onClick={cancelEditReply}
                            >
                              <X className="size-3.5" />
                              Cancel
                            </Button>
                            <Button
                              variant="ghost"
                              className="annot-edit-done"
                              title="Save reply"
                              disabled={!replyDraft.trim()}
                              onClick={saveEditReply}
                            >
                              <Check className="size-3.5" />
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="annot-reply-msg">{r.message}</div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="annot-empty">
                  <MessageSquare className="size-4" aria-hidden="true" />
                  No replies yet — start the thread.
                </div>
              )}
            </div>
            <div className="annot-reply-input">
              <span
                className="annot-avatar annot-avatar-me"
                style={{ '--av-h': String(authorHue(myReplyName)) } as CSSProperties}
                aria-hidden="true"
              >
                {authorInitials(myReplyName)}
              </span>
              <div className="annot-reply-composer">
                <Textarea
                  className="annot-input annot-reply-ta"
                  rows={2}
                  placeholder="Write a reply…"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={stopKeyLeak}
                  onKeyUp={stopKeyLeak}
                />
                <Button
                  variant="ghost"
                  className="annot-reply-send"
                  title="Send reply"
                  disabled={!replyText.trim()}
                  onClick={sendReply}
                >
                  <SendHorizontal className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </details>
        )}

        {!ro && isDraft && (
          <div className="annot-submit-row">
            {Number.isFinite(quota.limit) && (
              <div
                className="annot-quota"
                title="Annotations per site — the limit resets 24h after each one is created. Upgrade for more."
              >
                <span className="annot-quota-count">
                  {quota.used} / {quota.limit} used
                </span>
                {quota.resetsInMs != null && (
                  <span className="annot-quota-reset">
                    · resets in ~{formatReset(quota.resetsInMs)}
                  </span>
                )}
              </div>
            )}
            <Button
              variant="ghost"
              className="annot-submit-btn"
              title={submitting ? 'Submitting…' : 'Submit & attach pin'}
              disabled={!canSubmit || submitting}
              aria-busy={submitting}
              onClick={submitDraft}
            >
              {submitting ? (
                <Loader2 className="size-4 annot-submit-spin" aria-hidden="true" />
              ) : (
                <SendHorizontal className="size-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
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
import { useCollab } from '@/context/collab-context'
import { useEntitlements } from '@/context/subscription-context'
import { resolve } from '@/lib/selector-engine'
import { markPinSeen, markSeen, unreadReplyIds } from '@/lib/reply-seen'
import { copyToClipboard } from '@/lib/clipboard'
import { authorHue, authorInitials, fmtDate, fmtReplyTime } from '@/lib/format'
import { PLAN_DISPLAY, PLAN_LIMITS, type PlanId } from '@/lib/plans'
import { Check, Loader2, Pencil, Trash2, X } from 'lucide-react'
import type { Annotation, Reply } from '@/lib/types'
import { PIN_COLORS, pinColorOf, pinVars } from './pin-colors'
import { elementAddress, elementLabel } from './element-label'
import { PinLimitUpgrade, fmtUnlock } from './PinLimitUpgrade'

// How long the "new reply" highlight stays on: three runs of the .8s
// spReplyFlash keyframe in annotate.css, plus a beat so the last pulse finishes.
const REPLY_FLASH_MS = 2600

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

/** Time left on a share link, e.g. "Expires in 24 hours". */
function expiryText(iso: string | null): string {
  if (iso === null) return 'Never expires'
  const ms = Date.parse(iso) - Date.now()
  if (!Number.isFinite(ms)) return 'Expires soon'
  if (ms <= 0) return 'Expired'
  const mins = Math.ceil(ms / 60_000)
  if (mins < 60) return `Expires in ${mins} minute${mins === 1 ? '' : 's'}`
  const hours = Math.round(ms / 3_600_000)
  if (hours < 48) return `Expires in ${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.round(ms / 86_400_000)
  return `Expires in ${days} days`
}

const XIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

export function AnnotationCard() {
  const ui = useAnnotationUI()
  const items = useAnnotations()
  const counts = useAnnotationCounts()
  const quota = useAnnotationQuota()
  const { planId } = useEntitlements()
  const collab = useCollab()
  const cardRef = useRef<HTMLElement>(null)
  const commentRef = useRef<HTMLTextAreaElement>(null)
  const commentId = useId()
  const replyId = useId()
  const [replyText, setReplyText] = useState('')
  // Which reply (if any) is being rewritten, plus its local draft — kept out of
  // the store per-keystroke, same rationale as the comment draft below.
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
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
  // Share-link copy feedback ('Copied' for a beat, like the design).
  const [linkCopied, setLinkCopied] = useState<'idle' | 'ok' | 'fail'>('idle')
  const linkTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The plan picker opened from the out-of-pins composer.
  const [upgradePlan, setUpgradePlan] = useState<'pro' | 'max' | null>(null)

  const ro = useRole() === 'client'

  const ann: Annotation | null =
    ui.draft ??
    (ui.activeId ? (items.find((a) => a.id === ui.activeId) ?? null) : null)
  const isDraft = ui.draft != null && ann != null && ann.id === ui.draft.id
  // Only the original author (or an unattributed note) may rewrite the comment.
  const canEdit = !ro && ann != null && !isDraft && store.canEdit(ann, ui.author)

  // Plans that would raise the user's cap, in upsell order.
  const upgradePlans = useMemo<Array<'pro' | 'max'>>(() => {
    const order: PlanId[] = ['pro', 'max']
    return order.filter(
      (p): p is 'pro' | 'max' =>
        p !== 'free' &&
        PLAN_LIMITS[p].annotationLimit > PLAN_LIMITS[planId].annotationLimit,
    )
  }, [planId])

  // Out of pins: a draft is open (the composer was already up, or the server
  // denied the reserve on submit) but the authoritative count is at the cap.
  const quotaFull =
    Number.isFinite(quota.limit) && quota.used >= quota.limit
  const locked = isDraft && !ro && quotaFull && upgradePlans.length > 0

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
  }, [targetRect, ann?.id, locked])

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
    setNewReplyIds(new Set())
    setUpgradePlan(null)
    if (wantsEdit) ui.clearEditIntent()
    const prevId = ann && !isDraft ? ann.id : null
    return () => commitPendingEdit(prevId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ann?.id])

  // Focus the comment box only when it's actually editable (new draft or an
  // explicit edit), placing the caret at the end.
  useEffect(() => {
    if (!ann || ro || locked) return
    if (!isDraft && !editing) return
    const ta = commentRef.current
    if (!ta) return
    ta.focus()
    const end = ta.value.length
    ta.setSelectionRange(end, end)
  }, [ann?.id, ro, isDraft, editing, locked])

  // Clear the unread-reply dot for a saved annotation while its card is open —
  // both on open and if a new reply streams in while it stays open. `myReplyName`
  // (below) is the same identity used to author replies, so self-replies are
  // ignored. Drafts have no replies, so they're skipped.
  //
  // Before clearing, capture WHICH replies were unread: dismissing the pin's dot
  // is the only signal the user gets, so the new replies flash — otherwise the
  // dot vanishes on open and the news is lost. Safe against the broad `ann` dep:
  // once markSeen has run, unreadReplyIds() is empty, so unrelated updates to the
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
    setNewReplyIds(new Set(fresh))
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setNewReplyIds(new Set()), REPLY_FLASH_MS)
  }, [ann, isDraft, ro, ui.author])

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current)
      if (linkTimer.current) clearTimeout(linkTimer.current)
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
  const color = pinColorOf(ann.styling?.background)
  const canSubmit = !!ann.comment.trim()
  const resolved = ann.status === 'Resolved'

  const setBackground = (hex: string) => {
    const styling = { ...(ann.styling ?? store.defaultStyling()), background: hex }
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

  // Resolved pins stay on the page (as a green check) and the thread stays open,
  // so the resolved banner shows and the status can be flipped straight back.
  const toggleResolve = () => {
    if (!isDraft) finishEdit()
    store.setStatus(ann.id, resolved ? 'Open' : 'Resolved')
  }

  // Await the submit so the spinner covers the whole round-trip: a denied
  // reserve keeps the draft open (the composer then flips to its out-of-pins
  // state), so the button has to come back to life rather than stay stuck.
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
  const commentOwner = (ann.author || '').trim()
  const commentIsMine = commentOwner
    ? commentOwner === myReplyName
    : !ro

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

  const onCopyLink = async () => {
    if (!collab.shareUrl) return
    const ok = await copyToClipboard(collab.shareUrl)
    setLinkCopied(ok ? 'ok' : 'fail')
    if (linkTimer.current) clearTimeout(linkTimer.current)
    linkTimer.current = setTimeout(() => setLinkCopied('idle'), 1600)
  }

  const targetLabel = targetEl
    ? elementLabel(ann.selector)
    : 'Element not found on this page'
  const targetTitle = targetEl ? elementAddress(ann.selector) : undefined

  const cardStyle: CSSProperties = {
    ...pinVars(color),
    left: pos?.left ?? 'auto',
    top: pos?.top ?? 70,
  }

  /* ───────────── Out of pins — composer ───────────── */
  if (locked) {
    const frac = Math.min(1, quota.used / quota.limit)
    const C = 113.1
    const first = upgradePlans[0]!
    return (
      <section
        id="annot-card"
        ref={cardRef}
        className="sp-an-card sp-an-locked"
        aria-label="Pin limit reached"
        style={cardStyle}
      >
        <header className="sp-an-head sp-an-head-locked">
          <span className="sp-an-title">New pin</span>
          <button
            type="button"
            className="sp-an-icon sm"
            aria-label="Close"
            title="Close"
            onClick={closeCard}
          >
            <XIcon size={16} />
          </button>
        </header>
        <div className="sp-an-lock-body">
          <div className="sp-an-lock-panel">
            <div className="sp-an-lock-top">
              <div className="sp-an-ring">
                <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
                  <circle cx="22" cy="22" r="18" fill="none" stroke="#fde68a" strokeWidth="5" />
                  <circle
                    cx="22"
                    cy="22"
                    r="18"
                    fill="none"
                    stroke="#d97706"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={`${(C * frac).toFixed(1)} ${C}`}
                  />
                </svg>
                <span className="sp-an-ring-n">
                  {quota.used}/{quota.limit}
                </span>
              </div>
              <div>
                <div className="sp-an-lock-title">
                  That&rsquo;s today&rsquo;s {quota.limit} pin
                  {quota.limit === 1 ? '' : 's'} on this site
                </div>
                <div className="sp-an-lock-sub">
                  {quota.resetsInMs != null ? (
                    <>
                      New pins unlock in{' '}
                      <span className="sp-an-mono sp-an-strong">
                        {fmtUnlock(quota.resetsInMs)}
                      </span>
                    </>
                  ) : (
                    <>New pins unlock when your daily limit resets</>
                  )}
                </div>
              </div>
            </div>
            <p className="sp-an-lock-note">
              Your existing pins stay saved and editable — only new ones are
              paused on this site.
            </p>
          </div>
          <div className="sp-an-lock-actions">
            {upgradePlans.map((p) => {
              const lim = PLAN_LIMITS[p].annotationLimit
              return (
                <button
                  key={p}
                  type="button"
                  className={'sp-an-lock-btn ' + (p === first ? 'primary' : 'outline')}
                  onClick={() => setUpgradePlan(p)}
                >
                  <span>
                    {Number.isFinite(lim)
                      ? `Get ${lim} pins a day with ${PLAN_DISPLAY[p].name}`
                      : `Go unlimited with ${PLAN_DISPLAY[p].name}`}
                  </span>
                  <span className="sp-an-mono sp-an-lock-price">
                    {PLAN_DISPLAY[p].monthlyPrice}/mo
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        <PinLimitUpgrade
          open={upgradePlan != null}
          onOpenChange={(o) => {
            if (!o) setUpgradePlan(null)
          }}
          initialPlan={upgradePlan ?? first}
          plans={upgradePlans}
          limit={quota.limit}
          resetsInMs={quota.resetsInMs}
        />
      </section>
    )
  }

  /* ───────────── New pin composer ───────────── */
  if (isDraft) {
    const showMeter = Number.isFinite(quota.limit)
    const segW = quota.limit > 6 ? 5 : 10
    const resetHint =
      quota.resetsInMs != null ? ` Resets in ${fmtUnlock(quota.resetsInMs)}.` : ''
    return (
      <section
        id="annot-card"
        ref={cardRef}
        className="sp-an-card sp-an-composer"
        aria-label="New pin"
        style={cardStyle}
      >
        <header className="sp-an-head">
          <span className="sp-an-title">New pin</span>
          <div
            role="radiogroup"
            aria-label="Pin color"
            className="sp-an-swatches"
          >
            {PIN_COLORS.map((c) => {
              const active = c.id === color.id
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={c.name}
                  title={c.name}
                  className="sp-an-swatch"
                  style={{ background: c.hex, ['--sw' as string]: c.hex }}
                  onClick={() => setBackground(c.hex)}
                />
              )
            })}
          </div>
          <button
            type="button"
            className="sp-an-icon"
            aria-label="Discard pin"
            title="Discard pin"
            onClick={closeCard}
          >
            <XIcon />
          </button>
        </header>
        <div className="sp-an-pad">
          <div
            className={'sp-an-chip' + (targetEl ? '' : ' orphan')}
            title={targetTitle}
          >
            <span className="sp-an-chip-dot" aria-hidden="true" />
            <span className="sp-an-chip-text">{targetLabel}</span>
          </div>
          <label htmlFor={commentId} className="sp-an-sr">
            Comment
          </label>
          <textarea
            id={commentId}
            ref={commentRef}
            className="sp-an-ta annot-comment-input"
            placeholder="What should change here?"
            value={ann.comment}
            onChange={(e) => onComment(e.target.value)}
            onKeyDown={(e) => {
              stopKeyLeak(e)
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void submitDraft()
              }
            }}
            onKeyUp={stopKeyLeak}
          />
        </div>
        <footer className="sp-an-foot">
          {showMeter && (
            <div
              className="sp-an-meter"
              role="img"
              aria-label={`${quota.used} of ${quota.limit} pins used today on this site.${resetHint}`}
              title={`Pins per site reset 24h after you use the last one.${resetHint}`}
            >
              <span className="sp-an-meter-bars" aria-hidden="true">
                {Array.from({ length: quota.limit }, (_, i) => (
                  <span
                    key={i}
                    className={i < quota.used ? 'on' : ''}
                    style={{ width: segW }}
                  />
                ))}
              </span>
              <span className="sp-an-mono sp-an-strong" aria-hidden="true">
                {quota.used}/{quota.limit}
              </span>
              <span aria-hidden="true">today</span>
            </div>
          )}
          <button
            type="button"
            className="sp-an-post annot-submit-btn"
            title={submitting ? 'Submitting…' : 'Submit & attach pin'}
            disabled={!canSubmit || submitting}
            aria-busy={submitting}
            onClick={submitDraft}
          >
            Post pin
            {submitting ? (
              <Loader2 className="annot-submit-spin" size={14} aria-hidden="true" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            )}
          </button>
        </footer>
      </section>
    )
  }

  /* ───────────── Pin thread ───────────── */
  const replyTo = commentOwner && commentOwner !== myReplyName
    ? commentOwner.split(/\s+/)[0]
    : null

  const message = (opts: {
    key: string
    mine: boolean
    name: string
    iso: string
    flash?: boolean
    refEl?: boolean
    actions?: ReactNode
    children: ReactNode
  }) => (
    <div
      key={opts.key}
      ref={opts.refEl ? firstNewRef : undefined}
      className={
        'sp-an-msg' + (opts.mine ? ' mine' : '') + (opts.flash ? ' is-new' : '')
      }
    >
      <span
        className="sp-an-av"
        style={{ '--av-h': String(authorHue(opts.name)) } as CSSProperties}
        aria-hidden="true"
      >
        {authorInitials(opts.name)}
      </span>
      <div className="sp-an-msg-col">
        <div className="sp-an-msg-meta">
          <span className="sp-an-msg-name">
            {opts.mine ? 'You' : opts.name || 'Anonymous'}
          </span>
          <span className="sp-an-msg-time" title={fmtDate(opts.iso)}>
            {opts.iso ? fmtReplyTime(opts.iso) : ''}
          </span>
          {opts.actions}
        </div>
        {opts.children}
      </div>
    </div>
  )

  return (
    <section
      id="annot-card"
      ref={cardRef}
      className="sp-an-card sp-an-thread"
      aria-label={`Pin ${num} thread`}
      style={cardStyle}
    >
      <header className="sp-an-head sp-an-head-thread">
        <span
          className={
            'sp-an-tchip' + (targetEl ? '' : ' orphan') + (resolved ? ' resolved' : '')
          }
          title={targetTitle}
        >
          <span className="sp-an-tchip-pin" aria-hidden="true">
            {resolved ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l5 5L20 7" />
              </svg>
            ) : (
              num
            )}
          </span>
          <span className="sp-an-tchip-text">{targetLabel}</span>
        </span>
        <button
          type="button"
          className={'sp-an-status ' + (resolved ? 'resolved' : 'open')}
          aria-label={
            resolved
              ? 'Status: Resolved. Reopen this pin'
              : 'Status: Open. Mark this pin as resolved'
          }
          title={resolved ? 'Reopen' : 'Mark as resolved'}
          onClick={toggleResolve}
        >
          <span className="sp-an-status-dot" aria-hidden="true" />
          {ann.status}
        </button>
        {!ro && (
          <button
            type="button"
            className="sp-an-icon"
            aria-label="Delete pin"
            title="Delete annotation"
            onClick={() => {
              store.remove(ann.id)
              ui.closeCard()
            }}
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className="sp-an-icon"
          aria-label="Close thread"
          title="Close"
          onClick={closeCard}
        >
          <XIcon />
        </button>
      </header>

      <div className="sp-an-msgs">
        {message({
          key: 'comment',
          mine: commentIsMine,
          name: commentOwner || (commentIsMine ? myReplyName : 'Anonymous'),
          iso: ann.createdAt,
          actions:
            canEdit && !editing ? (
              <button
                type="button"
                className="sp-an-mini"
                aria-label="Edit comment"
                title="Edit comment"
                onClick={() => {
                  setCommentDraft(ann.comment)
                  setEditing(true)
                }}
              >
                <Pencil size={12} aria-hidden="true" />
              </button>
            ) : null,
          children: editing ? (
            <div className="sp-an-editbox">
              <label htmlFor={commentId} className="sp-an-sr">
                Comment
              </label>
              <textarea
                id={commentId}
                ref={commentRef}
                className="sp-an-ta sp-an-ta-sm annot-comment-input"
                rows={3}
                value={commentDraft ?? ann.comment}
                onChange={(e) => onComment(e.target.value)}
                onKeyDown={stopKeyLeak}
                onKeyUp={stopKeyLeak}
              />
              <div className="sp-an-editrow">
                <button type="button" className="sp-an-pill primary" title="Done editing" onClick={finishEdit}>
                  <Check size={13} aria-hidden="true" />
                  Done
                </button>
              </div>
            </div>
          ) : (
            <p className="sp-an-bubble">{ann.comment || '—'}</p>
          ),
        })}

        {replies.map((r) => {
          const mine = canEditReply(r)
          return message({
            key: r.id,
            mine,
            name: r.author || 'Anonymous',
            iso: r.createdAt,
            flash: newReplyIds.has(r.id),
            refEl: r.id === firstNewId,
            actions:
              editingReplyId !== r.id && mine ? (
                <button
                  type="button"
                  className="sp-an-mini"
                  aria-label="Edit reply"
                  title="Edit reply"
                  onClick={() => startEditReply(r)}
                >
                  <Pencil size={12} aria-hidden="true" />
                </button>
              ) : null,
            children:
              editingReplyId === r.id ? (
                <div className="sp-an-editbox">
                  <label htmlFor={replyId + r.id} className="sp-an-sr">
                    Edit reply
                  </label>
                  <textarea
                    id={replyId + r.id}
                    className="sp-an-ta sp-an-ta-sm"
                    rows={2}
                    autoFocus
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    onKeyDown={stopKeyLeak}
                    onKeyUp={stopKeyLeak}
                  />
                  <div className="sp-an-editrow">
                    <button type="button" className="sp-an-pill" title="Cancel" onClick={cancelEditReply}>
                      <X size={13} aria-hidden="true" />
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="sp-an-pill primary"
                      title="Save reply"
                      disabled={!replyDraft.trim()}
                      onClick={saveEditReply}
                    >
                      <Check size={13} aria-hidden="true" />
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <p className="sp-an-bubble">{r.message}</p>
              ),
          })
        })}

        {!replies.length && (
          <p className="sp-an-empty">No replies yet — start the thread.</p>
        )}

        {resolved && (
          <div className="sp-an-resolved" role="status">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12l5 5L20 7" />
            </svg>
            Marked as resolved
          </div>
        )}

        <div className="sp-an-reply">
          <label htmlFor={replyId} className="sp-an-sr">
            Reply
          </label>
          <input
            id={replyId}
            type="text"
            className="sp-an-reply-in"
            placeholder={replyTo ? `Reply to ${replyTo}…` : 'Write a reply…'}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => {
              stopKeyLeak(e)
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault()
                sendReply()
              }
            }}
            onKeyUp={stopKeyLeak}
          />
          <button
            type="button"
            className="sp-an-send"
            aria-label="Send reply"
            title="Send reply"
            disabled={!replyText.trim()}
            onClick={sendReply}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>

      {ro && (
        <div className="sp-an-notice">
          <span className="sp-an-notice-ic" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </span>
          <span>
            <strong>Client Mode on</strong> — reviewers can reply and change
            status, not edit your notes.
          </span>
        </div>
      )}

      {collab.enabled && collab.shareUrl && !collab.sessionEnded && (
        <footer className="sp-an-share">
          <span className="sp-an-share-ic" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
              <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
            </svg>
          </span>
          <div className="sp-an-share-txt">
            <div className="sp-an-share-h">Share link</div>
            <div className="sp-an-share-s">{expiryText(collab.sessionExpiresAt)}</div>
          </div>
          <button
            type="button"
            className={'sp-an-copy' + (linkCopied === 'ok' ? ' copied' : '')}
            onClick={() => void onCopyLink()}
          >
            {linkCopied === 'ok'
              ? 'Copied'
              : linkCopied === 'fail'
                ? 'Copy failed'
                : 'Copy link'}
          </button>
        </footer>
      )}
    </section>
  )
}

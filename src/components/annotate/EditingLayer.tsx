import { useEffect, useMemo, useRef } from 'react'
import { useCollab, type RemoteEditing } from '@/context/collab-context'
import { useAnnotationUI } from '@/context/annotation-ui-context'
import { useScanner } from '@/context/scanner-context'
import { useElementRect } from '@/hooks/use-element-rect'
import { getUniqueSelector, resolve } from '@/lib/selector-engine'

/* Live "who's focused on what" markers. Mirrors CursorLayer's dual role: it
   broadcasts the element I'm currently working on (red outline for peers) plus a
   transient "typing…" flag, and renders the same for every other peer. Keyed to
   an element via its SelectorRecord rather than to a pointer position.

   The focused element is the open annotation draft when annotating, otherwise
   the frozen/selected element in inspect (and other) modes — so peers see what
   I'm looking at regardless of which tab I'm on. */

const HEARTBEAT = 2500 // ms — re-broadcast so peers' TTL never lapses while open
const TYPING_IDLE = 2500 // ms after last keystroke before reverting to "selected"

export function EditingLayer() {
  const { enabled, remoteEditing, sendEditing } = useCollab()
  const { draft } = useAnnotationUI()
  const { isActive, frozen, selectedEl } = useScanner()

  // draft.selector is stable across keystrokes (updateDraft preserves it), so
  // it's safe as an effect dependency. The draft takes priority; otherwise a
  // frozen inspect/ruler/dropper selection is what we broadcast.
  const draftSelector = draft?.selector ?? null
  const comment = draft?.comment ?? ''
  const isDraft = !!draftSelector

  // useMemo keeps the selector reference stable across re-renders/heartbeats so
  // the lifecycle effect doesn't churn; it changes only when the focus changes.
  const focusSelector = useMemo(() => {
    if (draftSelector) return draftSelector
    if (isActive && frozen && selectedEl) return getUniqueSelector(selectedEl)
    return null
  }, [draftSelector, isActive, frozen, selectedEl])

  const typingRef = useRef(false)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Lifecycle + heartbeat: announce the element on focus, keep it alive, retract
  // it when focus clears (focusSelector → null) or on unmount.
  useEffect(() => {
    if (!enabled || !focusSelector) return
    typingRef.current = false
    sendEditing(focusSelector, false)
    const beat = setInterval(() => sendEditing(focusSelector, typingRef.current), HEARTBEAT)
    return () => {
      clearInterval(beat)
      sendEditing(null, false)
    }
  }, [enabled, focusSelector, sendEditing])

  // Typing detection (draft only): flip to "typing" on the first keystroke and
  // broadcast the transition; an idle timer flips it back to "selected" after a
  // pause. We only broadcast on transitions — the heartbeat carries the state.
  useEffect(() => {
    if (!enabled || !isDraft || !focusSelector) return
    const hasText = comment.trim().length > 0
    if (idleTimer.current) clearTimeout(idleTimer.current)
    if (hasText) {
      if (!typingRef.current) {
        typingRef.current = true
        sendEditing(focusSelector, true)
      }
      idleTimer.current = setTimeout(() => {
        typingRef.current = false
        sendEditing(focusSelector, false)
      }, TYPING_IDLE)
    } else if (typingRef.current) {
      typingRef.current = false
      sendEditing(focusSelector, false)
    }
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current)
    }
  }, [enabled, isDraft, focusSelector, comment, sendEditing])

  if (!enabled || remoteEditing.length === 0) return null

  return (
    <>
      {remoteEditing.map((e) => (
        <RemoteEditMarker key={e.id} editing={e} />
      ))}
    </>
  )
}

/* One peer's marker. Its own component so each can call useElementRect (hooks
   can't run in a loop). Resolves the shared selector to the live element and
   pins a fixed-position red box over it, with a "typing…" pill while active. */
function RemoteEditMarker({ editing }: { editing: RemoteEditing }) {
  // resolve() returns the live DOM node (stable reference across re-renders for
  // the same element), so useElementRect's effect doesn't thrash on heartbeats.
  const el = resolve(editing.selector)
  const rect = useElementRect(el)
  if (!el || !rect) return null

  return (
    <div
      className="collab-edit-box"
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      }}
    >
      {editing.typing && (
        <span className="collab-edit-label">
          <span className="collab-edit-name">{editing.name} is typing</span>
          <span className="collab-typing-dots" aria-hidden="true">
            <span style={{ background: editing.color }} />
            <span style={{ background: editing.color }} />
            <span style={{ background: editing.color }} />
          </span>
        </span>
      )}
    </div>
  )
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase, isCollabEnabled } from '@/lib/supabase'
import { makeIdentity, type CollabUser } from '@/lib/collab-identity'
import {
  buildShareUrl,
  canonicalPageUrl,
  getSessionIdFromUrl,
  isSameSessionOrigin,
  isSessionExpired,
  isSessionHosted,
  markSessionHosted,
  newSessionId,
  originOf,
  shareUrlForPage,
} from '@/lib/session'
import {
  deactivateSession,
  deleteSession,
  fetchSession,
  mintSession,
  reactivateSession,
} from '@/lib/session-api'
import { useAnnotationUI } from '@/context/annotation-ui-context'
import { useAuth } from '@/context/auth-context'
import { GATING_ACTIVE } from '@/context/subscription-context'
import { store, useRole } from '@/hooks/use-annotations'
import type { AnnotationRow } from '@/lib/annotation-mapper'
import type { SelectorRecord } from '@/lib/types'

/* ─────────────────────────────────────────────────────────────────────────
   CollabContext — owns the realtime channel for the *current live session*
   and exposes collaboration state to the UI:
     • onlineUsers   — Supabase Presence roster (toolbar "who's here")
     • remoteCursors — peers' live cursor positions (cursor overlay)
     • remoteEditing — which element each peer is mid-annotating (edit overlay)
     • identity      — who I am in the room
     • sessionId     — the active session (channel key); null until one starts
     • shareUrl      — the link that joins this session (shown in Share menu)
     • startSession  — author-only: mint a new session + link
     • notifications — transient join/leave messages (toasts)
   Live collab is gated by a session id: with no session, no channel is opened,
   so visitors who lack the link cannot join. Annotation sync stays page-scoped
   (Postgres Changes filtered by page_url drive store.applyRemote*).
   When Supabase isn't configured this is an inert passthrough.
───────────────────────────────────────────────────────────────────────── */

const CURSOR_TTL = 5000 // drop a peer cursor with no update for this long
const EDITING_TTL = 6000 // drop a peer's edit marker with no heartbeat for this long
// Heads-up before a live room's share link expires, so nobody loses their place
// mid-sentence. Annotations survive (they're page-scoped) — the ROOM closes.
const EXPIRY_WARNING_MS = 30 * 60 * 1000

export interface RemoteCursor {
  id: string
  name: string
  color: string
  x: number // viewport coords
  y: number
  at: number
}

export interface RemoteEditing {
  id: string // peer user id
  name: string
  color: string
  selector: SelectorRecord // which element they're annotating
  typing: boolean // text changed within the last few seconds
  at: number // timestamp for TTL
}

export interface CollabNotification {
  id: string
  message: string
}

interface CollabValue {
  enabled: boolean
  identity: CollabUser | null
  onlineUsers: CollabUser[]
  remoteCursors: RemoteCursor[]
  remoteEditing: RemoteEditing[]
  sendCursor: (x: number, y: number) => void
  sendEditing: (selector: SelectorRecord | null, typing: boolean) => void
  // Live session
  sessionId: string | null
  shareUrl: string | null
  isHost: boolean
  sessionEnded: boolean
  // When the current link dies, as an ISO string. null = never expires (Max), or
  // no session. Read from the session ROW (not from the entitlement), so it's the
  // real stored expiry even if the plan lookup and the DB ever disagree.
  sessionExpiresAt: string | null
  // Why the last startSession() produced no link (null = no error). Distinct from
  // shareDegraded, which means a link WAS created but only at the Free duration.
  shareError: string | null
  shareDegraded: boolean
  // Set when a share link is opened on a different origin than it was created on
  // — collaboration is blocked and the CrossDomainDialog is shown.
  crossDomain: { pageUrl: string; origin: string } | null
  // The working link to rejoin the session on its ORIGINAL site (null unless
  // crossDomain is set). Drives the dialog's "Open Original Website" action.
  originalShareUrl: string | null
  createNewSession: () => void
  startSession: () => Promise<string | null>
  /** Host-only: retire the current link and mint a replacement. Null if the mint
      failed (the old link is then left intact) or the caller isn't the host. */
  regenerateSession: () => Promise<string | null>
  // Join/leave + transient notifications (toasts)
  notifications: CollabNotification[]
  notify: (message: string) => void
  dismissNotification: (id: string) => void
}

const CollabContext = createContext<CollabValue | null>(null)

export function CollabProvider({ children }: { children: ReactNode }) {
  const ui = useAnnotationUI()
  const role = useRole()
  const { isConfigured, isAuthenticated, loading, getToken } = useAuth()
  // When auth is configured, the channel (and its annotation hydrate) must not
  // open for signed-out visitors — a session link alone must not leak the
  // page's annotations. Wait for Clerk to settle before deciding.
  const authReady = !loading && (isConfigured ? isAuthenticated : true)
  const identity = useMemo<CollabUser | null>(
    () => (isCollabEnabled ? makeIdentity(ui.author, role) : null),
    [ui.author, role],
  )

  const [sessionId, setSessionId] = useState<string | null>(() =>
    isCollabEnabled ? getSessionIdFromUrl() : null,
  )
  // The host is whoever created the session (or anyone before one starts, so
  // they can start it) — not a function of edit permissions. Everyone in a
  // session is a full collaborator; only the host can mint/regenerate links.
  const isHost = !sessionId || isSessionHosted(sessionId)
  const [sessionEnded, setSessionEnded] = useState(false)
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)
  const [shareDegraded, setShareDegraded] = useState(false)
  const [crossDomain, setCrossDomain] = useState<{
    pageUrl: string
    origin: string
  } | null>(null)
  const [onlineUsers, setOnlineUsers] = useState<CollabUser[]>([])
  const [cursorMap, setCursorMap] = useState<Record<string, RemoteCursor>>({})
  const [editingMap, setEditingMap] = useState<Record<string, RemoteEditing>>({})
  const [notifications, setNotifications] = useState<CollabNotification[]>([])

  const channelRef = useRef<RealtimeChannel | null>(null)
  const identityRef = useRef(identity)
  identityRef.current = identity
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId
  // getToken and the gating flag reach startSession through refs, NOT deps. The
  // extension's getToken is an inline arrow inside a useMemo over its auth
  // snapshot, so it gets a new identity on every focus/visibility auth re-check —
  // in the deps it would re-create startSession, then the value memo, then
  // re-render every useCollab() consumer (toolbar, pins, cursors) on tab focus.
  const getTokenRef = useRef(getToken)
  getTokenRef.current = getToken
  const quotaActiveRef = useRef(false)
  quotaActiveRef.current = isAuthenticated && GATING_ACTIVE
  // De-dupes concurrent startSession() calls. The toolbar and the share dialog's
  // retry each guard themselves but not each other, and minting is now a network
  // round trip — two overlapping calls would insert two rows, orphaning one.
  const mintingRef = useRef<Promise<string | null> | null>(null)
  // Roster snapshot (id → name) to diff joins/leaves and to know when I'm last.
  const rosterRef = useRef<Map<string, string>>(new Map())
  const rosterInitRef = useRef(false)
  const notifSeqRef = useRef(0)

  const pushNotification = useCallback((message: string) => {
    const id = 'n' + notifSeqRef.current++
    setNotifications((n) => [...n, { id, message }])
  }, [])

  const dismissNotification = useCallback((id: string) => {
    setNotifications((n) => n.filter((x) => x.id !== id))
  }, [])

  /* The current link is gone — expired, swept by pg_cron, or deleted. The HOST
     drops back to a no-session state so Share immediately mints a fresh link;
     everyone else is locked out with the ended banner.

     The host branch CLEARS sessionEnded rather than setting it: SessionEndedBanner
     renders only for non-hosts (see AnnotationLayer), so a host left with
     sessionEnded:true gets dark pins and cursors, no explanation, and a stale
     shareUrl that makes Share a no-op — a dead end. That mattered little at a
     3-day lifetime nobody reached; at 24h a Free host would hit it daily. */
  const endDeadSession = useCallback((hosted: boolean) => {
    setSessionExpiresAt(null)
    if (hosted) {
      setSessionEnded(false)
      setSessionId(null)
      history.replaceState(null, '', canonicalPageUrl())
    } else {
      setSessionEnded(true)
    }
  }, [])

  // Open the channel for the active session; re-run when the session changes,
  // auth settles, or the session ends (ending tears the channel down).
  useEffect(() => {
    if (!isCollabEnabled || !supabase || !sessionId || !authReady) return
    if (sessionEnded) return
    if (crossDomain) return
    const sb = supabase
    const me = identityRef.current
    if (!me) return

    let cancelled = false
    let channel: RealtimeChannel | null = null
    // Reset per-session roster diff state.
    rosterRef.current = new Map()
    rosterInitRef.current = false

    void (async () => {
      // Validate the session before joining — invalid/ended links can't connect.
      const session = await fetchSession(sessionId)
      if (cancelled) return
      const hosted = isSessionHosted(sessionId)
      if (!session) {
        // Row is gone — almost always the expiry sweep having already run. Same
        // outcome as an expired-but-present row, including the host reset.
        endDeadSession(hosted)
        return
      }
      // Bind the link to its origin: a session created on one site must not open
      // on another (its id/channel are otherwise valid, so nothing else stops
      // it). Reject BEFORE hydrating annotations or opening the channel, so no
      // collaboration or annotation sync ever starts on the wrong site.
      if (!isSameSessionOrigin(session.page_url)) {
        setSessionExpiresAt(null)
        setCrossDomain({
          pageUrl: session.page_url,
          origin: originOf(session.page_url) ?? session.page_url,
        })
        return
      }
      setCrossDomain(null)
      // Past the lifetime its creator's plan granted: remove the dead link from
      // the backend (its annotations are page-scoped and stay put).
      if (isSessionExpired(session)) {
        void deleteSession(sessionId)
        endDeadSession(hosted)
        return
      }
      // Adopt the row's stored expiry — the source of truth for what the UI
      // promises and what the countdown below arms against. A null value means
      // this link never expires (Max).
      setSessionExpiresAt(session.expires_at ?? null)
      if (!session.active) {
        // `active` is a best-effort "room is empty" hint (flipped on the last
        // participant's unload — including an accidental refresh or a Vite HMR
        // reload), NOT a revocation. A link is only truly dead once it EXPIRES
        // (handled above). So ANYONE reopening a non-expired link revives the
        // room rather than being locked out — otherwise a host who briefly
        // closed their tab would silently kill the link for every joiner
        // (no presence, no cursors, no live sync).
        void reactivateSession(sessionId)
      }
      setSessionEnded(false)

      // The session row records the canonical page url the HOST created it on.
      // Adopt it as the local page identity BEFORE any read or write, so host
      // and joiners can never scope annotations differently — a disagreement
      // here raises no error, it just gives every participant a private set
      // (each sees only their own pins). No-op when we already agree, and
      // ignored outright for a different document (see setPageScope).
      store.setPageScope(session.page_url)
      const scope = store.pageScope()

      // Load existing annotations immediately, the moment the session is valid —
      // NOT gated on the realtime channel. A joiner must see what's already there
      // even if the websocket is slow, errors, or realtime isn't enabled on the
      // project; realtime only layers live updates on top of this baseline.
      void store.hydrateFromDb()

      channel = sb.channel(`annot:${sessionId}`, {
        config: { presence: { key: me.id } },
      })
      channelRef.current = channel

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel!.presenceState<CollabUser>()
          const users: CollabUser[] = []
          Object.values(state).forEach((entries) => {
            const u = entries[0]
            if (u) users.push({ id: u.id, name: u.name, color: u.color, role: u.role })
          })
          // Diff against the last roster to emit join/leave toasts (skip self and
          // the very first sync, which would otherwise toast everyone present).
          const curr = new Map(users.map((u) => [u.id, u.name]))
          if (rosterInitRef.current) {
            for (const [id, name] of curr) {
              if (id !== me.id && !rosterRef.current.has(id)) {
                pushNotification(`${name || 'Someone'} joined`)
              }
            }
            for (const [id, name] of rosterRef.current) {
              if (id !== me.id && !curr.has(id)) {
                pushNotification(`${name || 'Someone'} left`)
              }
            }
          }
          rosterRef.current = curr
          rosterInitRef.current = true
          setOnlineUsers(users)
        })
        .on('presence', { event: 'leave' }, ({ key }) => {
          setCursorMap((m) => {
            if (!m[key]) return m
            const next = { ...m }
            delete next[key]
            return next
          })
          setEditingMap((m) => {
            if (!m[key]) return m
            const next = { ...m }
            delete next[key]
            return next
          })
        })
        .on('broadcast', { event: 'cursor' }, ({ payload }) => {
          const c = payload as RemoteCursor
          if (!c || c.id === identityRef.current?.id) return
          setCursorMap((m) => ({ ...m, [c.id]: { ...c, at: Date.now() } }))
        })
        .on('broadcast', { event: 'editing' }, ({ payload }) => {
          const e = payload as RemoteEditing
          if (!e || e.id === identityRef.current?.id) return
          // A null selector is an explicit "stopped editing" signal.
          if (!e.selector) {
            setEditingMap((m) => {
              if (!m[e.id]) return m
              const next = { ...m }
              delete next[e.id]
              return next
            })
            return
          }
          setEditingMap((m) => ({ ...m, [e.id]: { ...e, at: Date.now() } }))
        })
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'annotations', filter: `page_url=eq.${scope}` },
          (payload) => store.applyRemoteUpsert(payload.new as AnnotationRow),
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'annotations', filter: `page_url=eq.${scope}` },
          (payload) => store.applyRemoteUpsert(payload.new as AnnotationRow),
        )
        .on(
          'postgres_changes',
          // DELETE events carry only the primary key (no page_url), so a
          // page_url filter silently drops every one of them — peers would
          // never see deletions. Subscribe unfiltered; applyRemoteDelete
          // no-ops for ids that aren't in this page's list anyway.
          { event: 'DELETE', schema: 'public', table: 'annotations' },
          (payload) => {
            const id = (payload.old as { id?: string })?.id
            if (id) store.applyRemoteDelete(id)
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
          (payload) => {
            const row = payload.new as { active?: boolean }
            // Session was invalidated elsewhere — drop out of the live room.
            if (row && row.active === false) setSessionEnded(true)
          },
        )
        .on(
          'postgres_changes',
          // The expiry sweep hard-deletes the row. Without this, nobody already in
          // the room notices: the channel, presence and the annotations
          // subscriptions are all independent of the sessions row, so the people
          // inside would keep collaborating indefinitely while every NEW joiner is
          // locked out. Unlike the annotations DELETE above, an id filter DOES work
          // here — id is the primary key, which the old record always carries.
          { event: 'DELETE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
          () => {
            // Ignore echoes for a session we've already moved off (regenerating a
            // link deletes the old row) — otherwise we'd tear down the new room.
            if (sessionIdRef.current !== sessionId) return
            endDeadSession(isSessionHosted(sessionId))
          },
        )
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            // Re-hydrate on (re)connect to pick up anything that changed while
            // the channel was down. The baseline load already happened above, so
            // a joiner is never left empty if this never fires.
            void store.hydrateFromDb()
            const m = identityRef.current
            if (m) void channel!.track(m)
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            // Surface realtime failures — otherwise "no cursors/presence/live
            // sync" is silent and impossible to diagnose. Existing annotations
            // still load (hydrate above runs independently of this channel).
            console.warn(
              `[collab] realtime channel "annot:${sessionId}" failed: ${status}`,
              err ?? '',
            )
          }
        })
    })()

    return () => {
      cancelled = true
      channelRef.current = null
      setOnlineUsers([])
      // Don't leave stale peer cursors/edit markers on screen after teardown.
      setCursorMap({})
      setEditingMap({})
      rosterRef.current = new Map()
      rosterInitRef.current = false
      if (channel) void sb.removeChannel(channel)
    }
    // NOTE: sessionExpiresAt is deliberately NOT a dep — this effect SETS it, so
    // depending on it would re-run the join (and re-open the channel) on every
    // mint. The countdown lives in its own effect below.
  }, [
    sessionId,
    authReady,
    sessionEnded,
    crossDomain,
    pushNotification,
    endDeadSession,
  ])

  /* Expire the room from the inside. The join check above only runs on
     mount/reload, and the realtime DELETE only fires once the sweep gets around to
     the row (every 5 min), so without this a session that dies mid-review keeps
     working for whoever is already in it. Null expiry (Max) arms nothing. */
  useEffect(() => {
    if (!sessionId || !sessionExpiresAt) return
    const due = Date.parse(sessionExpiresAt)
    if (!Number.isFinite(due)) return

    let timer: ReturnType<typeof setTimeout>
    let warned = false
    const onExpire = () => {
      void deleteSession(sessionId)
      endDeadSession(isSessionHosted(sessionId))
    }
    /* Re-arm in chunks instead of one long timeout: setTimeout's delay is a signed
       32-bit int, and Pro's 30 days (2_592_000_000 ms) overflows it — the timer
       would wrap and fire immediately, "expiring" a fresh link within seconds. */
    const CHUNK = 2_147_483_647
    const arm = () => {
      const left = due - Date.now()
      if (left <= 0) {
        onExpire()
        return
      }
      if (!warned && left <= EXPIRY_WARNING_MS) {
        warned = true
        pushNotification(
          'This share link expires soon — the review will close shortly.',
        )
      }
      // Wake at the warning boundary if it's still ahead, so the notice is timely.
      const next = warned ? left : Math.min(left - EXPIRY_WARNING_MS, left)
      timer = setTimeout(arm, Math.min(Math.max(next, 0), CHUNK))
    }
    arm()
    return () => clearTimeout(timer)
  }, [sessionId, sessionExpiresAt, endDeadSession, pushNotification])

  // Re-broadcast presence when my name/role changes (keep roster labels fresh).
  useEffect(() => {
    const ch = channelRef.current
    if (!ch || !identity) return
    void ch.track(identity)
  }, [identity])

  // Best-effort invalidation: when the last participant leaves, end the session
  // so its link can't reconnect anyone. (The last leaver is the only one who can
  // observe an otherwise-empty room, so we act on unload.)
  const onlineUsersRef = useRef(onlineUsers)
  onlineUsersRef.current = onlineUsers
  useEffect(() => {
    if (!isCollabEnabled) return
    const onUnload = () => {
      const sid = sessionIdRef.current
      // Host-only: presence can lag, so a joiner's stale "I'm alone" roster
      // must not end the session under participants who are still present.
      // Fire-and-forget: deactivateSession dispatches a keepalive request that
      // survives this document, so there is nothing to await here.
      if (sid && isSessionHosted(sid) && onlineUsersRef.current.length <= 1)
        deactivateSession(sid)
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])

  // Periodically drop stale cursors and edit markers (peer idle / tab gone).
  useEffect(() => {
    if (!isCollabEnabled) return
    const t = setInterval(() => {
      const now = Date.now()
      const cursorCutoff = now - CURSOR_TTL
      setCursorMap((m) => {
        let changed = false
        const next: Record<string, RemoteCursor> = {}
        for (const [k, v] of Object.entries(m)) {
          if (v.at >= cursorCutoff) next[k] = v
          else changed = true
        }
        return changed ? next : m
      })
      const editCutoff = now - EDITING_TTL
      setEditingMap((m) => {
        let changed = false
        const next: Record<string, RemoteEditing> = {}
        for (const [k, v] of Object.entries(m)) {
          if (v.at >= editCutoff) next[k] = v
          else changed = true
        }
        return changed ? next : m
      })
    }, 2000)
    return () => clearInterval(t)
  }, [])

  const startSession = useCallback(async (): Promise<string | null> => {
    if (!isCollabEnabled) return null
    // Concurrent callers share one mint (toolbar + dialog retry — see mintingRef).
    if (mintingRef.current) return mintingRef.current

    const run = async (): Promise<string | null> => {
      const me = identityRef.current
      /* Capture the id and the page BEFORE awaiting. Minting is a network round
         trip now, and the user can client-side navigate during it (the app routes
         / ⇄ /account without a reload) — buildShareUrl reads location.href at call
         time, so it would stamp the session onto whatever page they landed on.
         shareUrlForPage pins the link to the page the row was actually created for.
         The id is ours so a retry is idempotent (the backend treats a duplicate
         primary key as success rather than orphaning a row). */
      const id = newSessionId()
      const pageUrl = store.pageScope()
      setShareError(null)
      setShareDegraded(false)

      const result = await mintSession({
        id,
        pageUrl,
        createdBy: me?.name ?? '',
        getToken: getTokenRef.current,
        active: quotaActiveRef.current,
      })
      if (!result) {
        setShareError(
          'Couldn’t create a share link. Check your connection and try again.',
        )
        return null
      }

      /* markSessionHosted MUST stay immediately before setSessionId, with no await
         between them: isHost and the join effect's `hosted` read localStorage
         synchronously at render/effect time, so a gap makes the host briefly look
         like a joiner — which routes the expired/inactive branches to the
         locked-out outcome instead of the reset. */
      markSessionHosted(result.id)
      setSessionEnded(false)
      setCrossDomain(null)
      setSessionExpiresAt(result.expiresAt)
      setShareDegraded(result.degraded)
      setSessionId(result.id)

      const url = shareUrlForPage(pageUrl, result.id)
      // Reflect the link in the address bar without a navigation — but only if
      // we're still on the page the session was minted for (see above).
      if (canonicalPageUrl() === pageUrl) history.replaceState(null, '', url)
      return url
    }

    const promise = run().finally(() => {
      mintingRef.current = null
    })
    mintingRef.current = promise
    return promise
  }, [])

  /* Retire the current link and mint a replacement. Needed because lifetime is
     fixed at creation and Share only mints when there ISN'T a link yet — without
     this, a host on a 24h link has no way to hand out a fresh one before it dies.
     Deleting the old row is the point: a regenerated link must invalidate the one
     already circulating (the sessions DELETE subscription drops anyone still in
     the old room). Annotations are page-scoped, so nothing is lost. */
  const regenerateSession = useCallback(async (): Promise<string | null> => {
    const previous = sessionIdRef.current
    if (previous && !isSessionHosted(previous)) return null // host mints links
    /* Mint FIRST, retire the old link only once the new one exists: a failed mint
       must not leave the host with no link at all. It also means our own DELETE
       echo arrives when sessionIdRef already points at the new session, so the
       DELETE handler's guard drops it instead of tearing down the fresh room. */
    const url = await startSession()
    if (url && previous) {
      // Say so if the old link couldn't actually be revoked — silently handing out
      // a "new" link while the previous one still works is the worst outcome here.
      const revoked = await deleteSession(previous)
      if (!revoked) {
        pushNotification(
          'New link created, but the previous one couldn’t be retired — it stays valid until it expires.',
        )
      }
    }
    return url
  }, [startSession, pushNotification])

  // Leave a cross-domain-rejected link and land clean on the CURRENT site (drops
  // the foreign session id), where Share can mint a session bound to this domain.
  const createNewSession = useCallback(() => {
    window.location.replace(canonicalPageUrl())
  }, [])

  const sendCursor = useCallback((x: number, y: number) => {
    const ch = channelRef.current
    const me = identityRef.current
    // Only broadcast once the WebSocket has actually joined. Sending before
    // that makes supabase-js fall back to a REST POST (now deprecation-warned),
    // and these cursor pings are ephemeral — dropping the pre-join ones is fine.
    if (!ch || !me || ch.state !== 'joined') return
    void ch.send({
      type: 'broadcast',
      event: 'cursor',
      payload: { id: me.id, name: me.name, color: me.color, x, y },
    })
  }, [])

  const sendEditing = useCallback(
    (selector: SelectorRecord | null, typing: boolean) => {
      const ch = channelRef.current
      const me = identityRef.current
      // See sendCursor: skip the REST fallback until the channel is joined.
      if (!ch || !me || ch.state !== 'joined') return
      void ch.send({
        type: 'broadcast',
        event: 'editing',
        payload: { id: me.id, name: me.name, color: me.color, selector, typing },
      })
    },
    [],
  )

  const remoteCursors = useMemo(() => Object.values(cursorMap), [cursorMap])
  const remoteEditing = useMemo(() => Object.values(editingMap), [editingMap])
  const shareUrl = useMemo(
    () => (sessionId ? buildShareUrl(sessionId) : null),
    [sessionId],
  )
  const originalShareUrl = useMemo(
    () =>
      crossDomain && sessionId
        ? shareUrlForPage(crossDomain.pageUrl, sessionId)
        : null,
    [crossDomain, sessionId],
  )

  const value = useMemo<CollabValue>(
    () => ({
      enabled: isCollabEnabled,
      identity,
      onlineUsers,
      remoteCursors,
      remoteEditing,
      sendCursor,
      sendEditing,
      sessionId,
      shareUrl,
      isHost,
      sessionEnded,
      sessionExpiresAt,
      shareError,
      shareDegraded,
      crossDomain,
      originalShareUrl,
      createNewSession,
      startSession,
      regenerateSession,
      notifications,
      notify: pushNotification,
      dismissNotification,
    }),
    [
      identity,
      onlineUsers,
      remoteCursors,
      remoteEditing,
      sendCursor,
      sendEditing,
      sessionId,
      shareUrl,
      isHost,
      sessionEnded,
      sessionExpiresAt,
      shareError,
      shareDegraded,
      crossDomain,
      originalShareUrl,
      createNewSession,
      startSession,
      regenerateSession,
      notifications,
      pushNotification,
      dismissNotification,
    ],
  )

  return <CollabContext value={value}>{children}</CollabContext>
}

export function useCollab(): CollabValue {
  const ctx = useContext(CollabContext)
  if (!ctx) throw new Error('useCollab must be used within CollabProvider')
  return ctx
}

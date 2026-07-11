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
  isSessionHosted,
  markSessionHosted,
} from '@/lib/session'
import {
  createSession,
  deactivateSession,
  deleteSession,
  fetchSession,
  isSessionExpired,
  reactivateSession,
} from '@/lib/session-api'
import { useAnnotationUI } from '@/context/annotation-ui-context'
import { useAuth } from '@/context/auth-context'
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

const PAGE = canonicalPageUrl()
const CURSOR_TTL = 5000 // drop a peer cursor with no update for this long
const EDITING_TTL = 6000 // drop a peer's edit marker with no heartbeat for this long

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
  startSession: () => Promise<string | null>
  // Join/leave + transient notifications (toasts)
  notifications: CollabNotification[]
  notify: (message: string) => void
  dismissNotification: (id: string) => void
}

const CollabContext = createContext<CollabValue | null>(null)

export function CollabProvider({ children }: { children: ReactNode }) {
  const ui = useAnnotationUI()
  const role = useRole()
  const { isConfigured, isAuthenticated, loading } = useAuth()
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
  const [onlineUsers, setOnlineUsers] = useState<CollabUser[]>([])
  const [cursorMap, setCursorMap] = useState<Record<string, RemoteCursor>>({})
  const [editingMap, setEditingMap] = useState<Record<string, RemoteEditing>>({})
  const [notifications, setNotifications] = useState<CollabNotification[]>([])

  const channelRef = useRef<RealtimeChannel | null>(null)
  const identityRef = useRef(identity)
  identityRef.current = identity
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId
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

  // Open the channel for the active session; re-run when the session changes,
  // auth settles, or the session ends (ending tears the channel down).
  useEffect(() => {
    if (!isCollabEnabled || !supabase || !sessionId || !authReady) return
    if (sessionEnded) return
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
        setSessionEnded(true)
        return
      }
      // Past its 3-day lifetime: remove the dead link from the backend (its
      // annotations are page-scoped and stay put). The host drops back to a
      // no-session state so Share mints a fresh link; everyone else is locked
      // out of the expired link.
      if (isSessionExpired(session)) {
        void deleteSession(sessionId)
        if (hosted) {
          setSessionEnded(false)
          setSessionId(null)
          history.replaceState(null, '', canonicalPageUrl())
        } else {
          setSessionEnded(true)
        }
        return
      }
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
          { event: 'INSERT', schema: 'public', table: 'annotations', filter: `page_url=eq.${PAGE}` },
          (payload) => store.applyRemoteUpsert(payload.new as AnnotationRow),
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'annotations', filter: `page_url=eq.${PAGE}` },
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
  }, [sessionId, authReady, sessionEnded, pushNotification])

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
      if (sid && isSessionHosted(sid) && onlineUsersRef.current.length <= 1)
        void deactivateSession(sid)
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
    const me = identityRef.current
    const id = await createSession(PAGE, me?.name ?? '')
    if (!id) return null
    markSessionHosted(id)
    setSessionEnded(false)
    setSessionId(id)
    // Reflect the link in the address bar without a navigation.
    history.replaceState(null, '', buildShareUrl(id))
    return buildShareUrl(id)
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
      startSession,
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
      startSession,
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

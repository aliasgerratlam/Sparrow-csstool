/* Service worker (MV3) / Firefox event page. Auth is shared with the Sparrow web
   app. The AUTHORITATIVE source is the web-app PUSH BRIDGE: the web app posts its
   live Clerk state, the content-script relay forwards it as MSG_AUTH_PUSH, and we
   mirror it into chrome.storage.local for the content script's
   ExtensionAuthProvider to gate the Annotate tool. Clerk Sync Host (same
   publishable key + `syncHost`) is a Chrome-only fallback — it can't work on
   Firefox (per-install moz-extension:// origin isn't allow-listed in Clerk).

   Jobs:
   1. Toggle the scanner on the active tab when the toolbar icon is clicked.
   2. Open the web app (sign-in) when the content script asks.
   3. Mirror the web-app push into the auth snapshot; on Chrome also re-check the
      synced session on demand / on Clerk cookie changes.
   4. On (re)install and browser start, clear the stale snapshot and re-validate.
   5. Sign out (ends the shared session) and clear the snapshot.
   6. Re-fetch cross-origin stylesheets the content script can't read under CORS. */
import { AUTH_PROMPT_PARAM, type AuthPromptMode } from '@/lib/clerk'
import {
  AUTH_STORAGE_KEY,
  MSG_AUTH_PUSH,
  MSG_CHECK_AUTH,
  MSG_OPEN_ACCOUNT,
  MSG_OPEN_SIGNIN,
  MSG_SIGNOUT,
  SIGNED_OUT,
  snapshotFromClerkUser,
  snapshotFromWebPayload,
  writeAuthSnapshot,
} from './auth-bridge'

// Injected at build time by vite.background.config.ts. The extension shares the
// web app's Clerk instance (same key) so Sync Host can read its session.
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined
// Origin whose Clerk cookies to sync from (prod: the web app origin).
const SYNC_HOST =
  (import.meta.env.VITE_EXT_SYNC_HOST as string | undefined) ||
  'https://www.trysparrowcss.com'
// Full web-app URL opened for sign-in (prod: the deployed web app).
const WEB_APP_URL =
  (import.meta.env.VITE_EXT_WEB_APP_URL as string | undefined) ||
  'https://www.trysparrowcss.com'
// Supabase project — used to reach the kelviq-plan Edge Function, which resolves
// the signed-in user's CURRENT plan live from Kelviq. Optional: without it, the
// extension falls back to whatever plan is in Clerk metadata (webhook-mirrored).
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined

/* Auth source of truth is the WEB-APP PUSH BRIDGE: the web app posts its live
   Clerk auth state, the content-script relay forwards it here as MSG_AUTH_PUSH,
   and we mirror it into the snapshot. Clerk Sync Host is kept only as a
   Chrome-only fallback — on Firefox it can't read the session (the per-install
   moz-extension:// origin isn't in Clerk's allowed_origins), so running it there
   would resolve signed-out and clobber a valid pushed snapshot. getBrowserInfo
   is a Firefox-only API, so its presence is a reliable Firefox probe. */
const isFirefox =
  typeof (chrome.runtime as { getBrowserInfo?: unknown }).getBrowserInfo ===
  'function'

/* Firefox MV3 treats host_permissions as OPT-IN: unlike Chrome, they are not
   granted at install. Without them the Clerk cookie watcher can't see the sync
   host, cross-origin CSS re-fetches are CORS-blocked, and content scripts don't
   auto-inject (so share-link auto-open is dead — only the activeTab toolbar
   path works). Track the grant and ask for it on toolbar click, the one place
   we reliably have the user gesture Firefox requires for permissions.request().
   On Chrome the permission already exists, so the request resolves silently. */
const HOST_PERMISSIONS = { origins: ['<all_urls>'] }
let hasHostPermissions = false
try {
  chrome.permissions.contains(HOST_PERMISSIONS, (granted) => {
    void chrome.runtime.lastError
    hasHostPermissions = !!granted
  })
  chrome.permissions.onAdded.addListener(() => {
    hasHostPermissions = true
    // Host access just arrived — the worker can finally read the sync host's
    // Clerk cookies, so refresh the auth snapshot right away.
    void checkAuth()
  })
} catch {
  // permissions API unavailable — leave the flag false; activeTab still works.
}

// Toolbar click → toggle the scanner.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return
  const tabId = tab.id
  // Must run before any `await`: Firefox only honours permissions.request()
  // while still synchronously inside the user-input handler.
  if (!hasHostPermissions) {
    try {
      chrome.permissions.request(HOST_PERMISSIONS, (granted) => {
        void chrome.runtime.lastError
        hasHostPermissions = !!granted
      })
    } catch {
      // Prompt refused to open (or API missing) — proceed with activeTab only.
    }
  }
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'sparrow-toggle' })
  } catch {
    // No content script answered. Almost always a tab that was already open
    // before the extension was installed/reloaded — Chrome only auto-injects
    // declared content scripts into pages loaded *after* install. Rather than
    // make the user reload the page, inject the content script on demand and
    // then toggle. executeScript resolves only after the script has run and
    // registered its message listener, so the follow-up toggle reaches it.
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['dist/content.js'],
      })
      await chrome.tabs.sendMessage(tabId, { type: 'sparrow-toggle' })
    } catch {
      // A restricted page where no extension script can run (chrome:// pages,
      // the Web Store, view-source:, the PDF viewer, etc.). Nothing we can do —
      // fail quietly.
    }
  }
})

function openSignIn(mode?: AuthPromptMode) {
  // Send the user to the web app to sign in (or sign up). The ?sparrow-auth
  // param makes the web app auto-open the matching Clerk form on arrival
  // (AuthPromptEffect in App.tsx).
  const url = new URL(WEB_APP_URL)
  url.searchParams.set(
    AUTH_PROMPT_PARAM,
    mode === 'signup' ? 'signup' : 'signin',
  )
  void chrome.tabs.create({ url: url.toString() })
}

/* Open a web-app page in a new tab. The content script can't navigate in-app
   (no router, and its window is the host page's), so account/profile links are
   routed here. Defaults to /account; only same-app absolute paths are honoured. */
function openWebApp(path?: string) {
  const base = WEB_APP_URL.replace(/\/+$/, '')
  const p =
    typeof path === 'string' && path.startsWith('/') ? path : '/account'
  void chrome.tabs.create({ url: `${base}${p}` })
}

// Build a synced Clerk client that reads the web app's session. Returns null if
// unconfigured or the sync fails (treated as signed-out).
async function loadSyncedClerk() {
  if (!PUBLISHABLE_KEY) return null
  try {
    // Imported lazily (not at module top level): @clerk/chrome-extension is a
    // large bundle, and if evaluating it ever throws on a Firefox event page, a
    // top-level import would abort the whole worker module BEFORE the toolbar
    // click / message listeners register — making the icon do nothing. Loading
    // it here keeps listener registration synchronous and unconditional.
    const { createClerkClient } = await import(
      '@clerk/chrome-extension/background'
    )
    return await createClerkClient({
      publishableKey: PUBLISHABLE_KEY,
      syncHost: SYNC_HOST,
    })
  } catch {
    return null
  }
}

/* Resolve the signed-in user's CURRENT plan live from Kelviq via the
   kelviq-plan Edge Function, so the extension reflects a purchase immediately —
   without waiting on the webhook to mirror the plan into Clerk metadata. Returns
   the publicMetadata fields to overlay, or null when unavailable (Supabase
   unconfigured, no token, or any error) — in which case we leave the
   Clerk-metadata plan untouched. */
async function fetchLivePlanMetadata(
  token: string | null,
): Promise<Record<string, unknown> | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !token) return null
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/kelviq-plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'x-clerk-token': token,
      },
      body: '{}',
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data || typeof data.plan !== 'string') return null
    // Shape it to match what userPlan() reads from publicMetadata.
    return {
      plan: data.plan,
      billing_cycle: data.billingCycle ?? null,
      plan_renews_at: data.renewsAt ?? null,
      subscription_status: data.status ?? null,
    }
  } catch {
    return null
  }
}

/* Best-effort CONFIRM-ONLY Sync Host check (Chrome only). The authoritative auth
   source is the web-app push bridge (MSG_AUTH_PUSH); Sync Host merely lets Chrome
   confirm a signed-in session quickly (and overlay the live Kelviq plan) without
   waiting on a push. It must NEVER write SIGNED_OUT: doing so on a transient Sync
   Host failure — or when the extension origin isn't allow-listed in Clerk — would
   clobber a valid pushed snapshot and lock a signed-in user out (the Chrome bug).
   Sign-out is owned by the push bridge (the site posts a signed-out state) and by
   the explicit signOut() action, both of which write SIGNED_OUT directly. */
async function checkAuth() {
  // Firefox: Sync Host can't resolve the session at all (see isFirefox) — skip
  // entirely so we don't even load the Clerk bundle there.
  if (isFirefox) return
  const clerk = await loadSyncedClerk()
  const snapshot = snapshotFromClerkUser(clerk?.user ?? null)
  // Confirm-only: never downgrade. If Sync Host didn't resolve a signed-in user,
  // leave whatever the push bridge stored untouched.
  if (!snapshot.isSignedIn || !snapshot.user) return

  // Overlay the live Kelviq plan so gating reflects the real subscription, not a
  // possibly-stale Clerk metadata mirror. Best-effort: on any failure we keep
  // the metadata plan already in the snapshot.
  let token: string | null = null
  try {
    token = (await clerk?.session?.getToken()) ?? null
  } catch {
    token = null
  }
  const livePlan = await fetchLivePlanMetadata(token)
  if (livePlan) {
    snapshot.user.metadata = { ...snapshot.user.metadata, ...livePlan }
  }

  await writeAuthSnapshot(snapshot)
}

// A single sign-in/out rewrites several __session*/__client* cookies in a quick
// burst; coalesce them so we build one Clerk client + one live-plan fetch per
// burst instead of one per cookie. The worker stays alive well past this window
// (the cookie event woke it), so the short timer fires reliably.
let cookieAuthTimer: ReturnType<typeof setTimeout> | undefined
function checkAuthDebounced() {
  if (cookieAuthTimer) clearTimeout(cookieAuthTimer)
  cookieAuthTimer = setTimeout(() => {
    cookieAuthTimer = undefined
    void checkAuth()
  }, 300)
}

/* Registrable base domain of a host, so cookie clears cover the app origin AND
   Clerk's FAPI subdomain (e.g. clerk.trysparrowcss.com). Simple last-two-labels
   heuristic — fine for our own single-level TLD sync host; `localhost` and bare
   domains pass through unchanged. */
function baseDomain(host: string): string {
  const parts = host.split('.')
  return parts.length <= 2 ? host : parts.slice(-2).join('.')
}

/* Sync Host is READ-ONLY by design: clerk.signOut() ends the EXTENSION's view of
   the session but deliberately leaves the website's cookies intact, so the site
   stays signed in. To log the user out everywhere, clear Clerk's session cookies
   on the sync-host domain (and its FAPI subdomain) ourselves — the website's
   Clerk instance then revalidates and signs out. Best-effort: on Firefox without
   granted host permissions there's no cookie access, so this is a no-op. */
async function clearSyncHostSession() {
  try {
    const domain = baseDomain(new URL(SYNC_HOST).hostname)
    const cookies = await chrome.cookies.getAll({ domain })
    await Promise.all(
      cookies
        .filter(
          (c) =>
            c.name === '__session' ||
            c.name.startsWith('__client') ||
            c.name.startsWith('__clerk'),
        )
        .map((c) => {
          const cookieDomain = c.domain.replace(/^\./, '')
          const url = `${c.secure ? 'https' : 'http'}://${cookieDomain}${c.path}`
          return chrome.cookies.remove({
            url,
            name: c.name,
            storeId: c.storeId,
          })
        }),
    )
  } catch {
    /* no cookie access (e.g. Firefox without host permissions) — best effort. */
  }
}

/* Reload any open sync-host (website) tabs so the sign-out shows IMMEDIATELY.
   Clerk on the site otherwise only revalidates on focus/refresh, so a tab left
   in the background would keep showing the signed-in UI until manually reloaded.
   Cookies are already cleared by the time this runs, so the reload loads a
   signed-out page. Best-effort: needs host access (Chrome has it; Firefox only
   after the permission grant). */
async function reloadSyncHostTabs() {
  try {
    const bd = baseDomain(new URL(SYNC_HOST).hostname)
    const tabs = await chrome.tabs.query({
      url: [`*://${bd}/*`, `*://*.${bd}/*`],
    })
    await Promise.all(
      tabs.map((t) =>
        t.id != null ? chrome.tabs.reload(t.id) : Promise.resolve(),
      ),
    )
  } catch {
    /* no tab/host access — the site updates on its next focus instead. */
  }
}

async function signOut() {
  try {
    const clerk = await loadSyncedClerk()
    await clerk?.signOut()
  } catch {
    // Even if Clerk sign-out fails, still clear cookies + close the gate below.
  }
  // Force the website to sign out too (Sync Host won't clear its cookies for us),
  // then reload its open tabs so the logout is visible without a manual refresh.
  await clearSyncHostSession()
  await reloadSyncHostTabs()
  await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: SIGNED_OUT })
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return
  if (msg.type === MSG_OPEN_SIGNIN) {
    openSignIn(msg.mode as AuthPromptMode | undefined)
    return
  }
  if (msg.type === MSG_OPEN_ACCOUNT) {
    openWebApp(msg.path as string | undefined)
    return
  }
  if (msg.type === MSG_AUTH_PUSH) {
    // Authoritative auth source: the web-app relay forwarded the site's live
    // Clerk state. Mirror it straight into the snapshot (the relayed user is
    // already the normalised AuthUser). The mirrored plan in user.metadata is
    // enough for gating; live-plan overlay stays on the Chrome Sync Host path.
    const snapshot = snapshotFromWebPayload({
      isSignedIn: msg.isSignedIn as boolean | undefined,
      user: msg.user,
    })
    void writeAuthSnapshot(snapshot)
    return
  }
  if (msg.type === MSG_CHECK_AUTH) {
    checkAuth().finally(() => sendResponse({ ok: true }))
    return true // async response
  }
  if (msg.type === MSG_SIGNOUT) {
    signOut().finally(() => sendResponse({ ok: true }))
    return true
  }
  if (msg.type === 'sparrow-fetch-css') {
    fetch(msg.url, { credentials: 'omit' })
      .then((r) => (r.ok ? r.text() : null))
      .then((text) => sendResponse({ text }))
      .catch(() => sendResponse({ text: null }))
    return true
  }
})

// When Clerk's session cookies change on the sync host (i.e. the user signs in
// or out on the web app), re-sync automatically — this wakes the worker, so it
// works even though MV3 service workers are ephemeral. (No-op on Firefox, where
// checkAuth() short-circuits; the push bridge covers it there.)
chrome.cookies.onChanged.addListener((change) => {
  const name = change.cookie?.name ?? ''
  if (name.startsWith('__session') || name.startsWith('__client')) {
    checkAuthDebounced()
  }
})

/* On (re)install and every browser start, never trust the persisted snapshot: a
   user carried over from a previous session must not appear — the account may be
   signed out or gone (the stale-cached-user bug), and on Firefox we can't Sync-
   Host-verify it. Clear it so the provider shows signed-out, then re-validate:
   Chrome re-confirms instantly via Sync Host; Firefox re-confirms from the next
   web-app push (the sign-in flow opens a web-app tab, and any open one re-posts
   on the relay's ready ping). */
function invalidateStoredAuth() {
  try {
    chrome.storage.local.remove(AUTH_STORAGE_KEY, () => {
      void chrome.runtime.lastError
    })
  } catch {
    /* storage unavailable — nothing to clear. */
  }
  void checkAuth()
}
chrome.runtime.onInstalled.addListener(invalidateStoredAuth)
chrome.runtime.onStartup.addListener(invalidateStoredAuth)

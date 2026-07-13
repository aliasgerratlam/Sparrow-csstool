/* Service worker (MV3). Auth is shared with the Sparrow web app via Clerk's
   Sync Host feature: the user signs in on the web app (localhost in dev), and
   this worker reads that session — using the SAME Clerk publishable key + a
   `syncHost` — and mirrors it into chrome.storage.local for the content script's
   ExtensionAuthProvider to gate the Annotate tool.

   Jobs:
   1. Toggle the scanner on the active tab when the toolbar icon is clicked.
   2. Open the web app (sign-in) when the content script asks.
   3. Re-check the synced session on demand and on Clerk cookie changes, writing
      the auth snapshot.
   4. Sign out (ends the shared session) and clear the snapshot.
   5. Re-fetch cross-origin stylesheets the content script can't read under CORS. */
import { createClerkClient } from '@clerk/chrome-extension/background'
import { AUTH_PROMPT_PARAM, type AuthPromptMode } from '@/lib/clerk'
import {
  AUTH_STORAGE_KEY,
  MSG_CHECK_AUTH,
  MSG_OPEN_SIGNIN,
  MSG_SIGNOUT,
  SIGNED_OUT,
  snapshotFromClerkUser,
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

// Toolbar click → toggle the scanner.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return
  const tabId = tab.id
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

// Build a synced Clerk client that reads the web app's session. Returns null if
// unconfigured or the sync fails (treated as signed-out).
async function loadSyncedClerk() {
  if (!PUBLISHABLE_KEY) return null
  try {
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

// Re-read the synced session and mirror it into the snapshot the content script
// watches. Called on demand (content script) and on Clerk cookie changes.
async function checkAuth() {
  const clerk = await loadSyncedClerk()
  const snapshot = snapshotFromClerkUser(clerk?.user ?? null)

  // Overlay the live Kelviq plan so gating reflects the real subscription, not a
  // possibly-stale Clerk metadata mirror. Best-effort: on any failure we keep
  // the metadata plan already in the snapshot.
  if (snapshot.isSignedIn && snapshot.user) {
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
  }

  await writeAuthSnapshot(snapshot)
}

async function signOut() {
  try {
    const clerk = await loadSyncedClerk()
    await clerk?.signOut()
  } catch {
    // Even if Clerk sign-out fails, still close the local gate below.
  }
  await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: SIGNED_OUT })
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return
  if (msg.type === MSG_OPEN_SIGNIN) {
    openSignIn(msg.mode as AuthPromptMode | undefined)
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
// works even though MV3 service workers are ephemeral.
chrome.cookies.onChanged.addListener((change) => {
  const name = change.cookie?.name ?? ''
  if (name.startsWith('__session') || name.startsWith('__client')) {
    void checkAuth()
  }
})

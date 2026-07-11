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
// Origin whose Clerk cookies to sync from (dev: http://localhost).
const SYNC_HOST =
  (import.meta.env.VITE_EXT_SYNC_HOST as string | undefined) ||
  'http://localhost'
// Full web-app URL opened for sign-in (dev: the Vite dev server).
const WEB_APP_URL =
  (import.meta.env.VITE_EXT_WEB_APP_URL as string | undefined) ||
  'http://localhost:5173'

// Toolbar click → toggle the scanner (unchanged from the original background.js).
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'sparrow-toggle' })
  } catch {
    // No content script here (chrome:// pages, the Web Store, or a tab loaded
    // before install — reload it). Nothing to do; fail quietly.
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

// Re-read the synced session and mirror it into the snapshot the content script
// watches. Called on demand (content script) and on Clerk cookie changes.
async function checkAuth() {
  const clerk = await loadSyncedClerk()
  await writeAuthSnapshot(snapshotFromClerkUser(clerk?.user ?? null))
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

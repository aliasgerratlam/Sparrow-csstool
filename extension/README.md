# Sparrow Scanner — Browser Extension

The tools from the landing page's **Try Demo** button — packaged as a browser
extension so you can run them on **any** website.

Six tools, one toolbar button:

| Tool | What it does |
| --- | --- |
| **Inspect** | Hover any element to see its matched author CSS rules (DevTools-style cascade), computed box, and fonts. Click to freeze, then copy. |
| **Annotate** | Drop pins on the page and review them in a sidebar (saved locally). |
| **Ruler** | Click an element to anchor, then measure the gap to whatever you point at. |
| **Colors** | Scan every color used on the page and swap any of them live. |
| **Fonts** | See every font on the page; replace one element's font or a whole family (Google Fonts or uploads). |
| **Assets** | List and download the page's images and other assets. |

Inspect / Ruler / Colors / Fonts / Assets run **locally** — nothing leaves your
browser. **Annotate requires signing in.** While signed out, the Annotate tool
is locked (a "Sign in to use Annotate" tooltip); the toolbar's **Sign in** button
opens the Sparrow web app, and once you sign in there the extension detects it
and unlocks Annotate.

---

## Configuration (required before Annotate works)

Auth is shared with the Sparrow **web app** through Clerk's [Sync Host](https://clerk.com/docs/guides/sessions/sync-host)
feature: the content script can't run Clerk itself (arbitrary host-page origins
inside a Shadow DOM), so the user signs in on the web app and the extension's
background worker reads that session (same Clerk instance) and mirrors it into
`chrome.storage` for the content script to gate on. To wire it up:

1. **Stable extension ID.** `manifest.json` ships a fixed `"key"`, pinning the
   extension ID to:

   ```
   mkbkmeemombaioeikegphonpbjliljbm
   ```

   (Load-unpacked uses only this public key. The matching private key is **not**
   in the repo — you only need it if you later pack a signed `.crx`.)

2. **Register the extension with Clerk.** Add the extension origin to your Clerk
   instance's `allowed_origins` via the Backend API (needs your **secret key**):

   ```bash
   curl -X PATCH https://api.clerk.com/v1/instance \
     -H "Authorization: Bearer sk_test_YOUR_SECRET_KEY" \
     -H "Content-type: application/json" \
     -d '{"allowed_origins": ["chrome-extension://mkbkmeemombaioeikegphonpbjliljbm"]}'
   ```

3. **Build-time env** (repo-root `.env.local`). The extension uses the **same**
   `VITE_CLERK_PUBLISHABLE_KEY` as the web app, plus:

   ```
   VITE_EXT_SYNC_HOST=https://www.trysparrowcss.com     # prod web app origin (dev: http://localhost)
   VITE_EXT_WEB_APP_URL=https://www.trysparrowcss.com   # page opened for sign-in
   ```

   These are inlined into the background bundle by `npm run build:ext`.

Without a configured `VITE_CLERK_PUBLISHABLE_KEY`, Annotate stays locked
(Inspect/Ruler/Colors/Fonts/Assets still work).

---

## Install (load unpacked)

Chrome MV3 and Firefox MV3 disagree on the `background` key (and a few others),
so the extension ships as **two separate, self-contained folders** — one per
browser family. Build them once:

```bash
npm run package:ext
```

That writes:

| Folder | Load in |
| --- | --- |
| `extension/build/chromium/` | **Chrome, Edge, Brave, Opera, Vivaldi** |
| `extension/build/firefox/`  | **Firefox 140+** (see the Firefox section) |

Each folder is fully self-contained (its own tailored `manifest.json` plus
copies of `dist/`, `icons/`, `fonts/`) and loads with **zero manifest warnings**
in its target browser. `extension/build/` is gitignored — it's a build artifact.

**Chromium:**

1. Run `npm run package:ext` (needs the bundles + the two folders).
2. Open the extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
3. Turn on **Developer mode** (top-right in Chrome, left sidebar in Edge).
4. Click **Load unpacked** and select the **`extension/build/chromium/`** folder.
5. Pin the Sparrow icon to your toolbar (puzzle-piece menu → pin).

### Use it

- Open any website.
- Click the **Sparrow toolbar icon** to bring the scanner up.
- Pick a tool from the mode rail on the left; hover/click the page.
- Click the icon again (or press **Esc**) to put it away.

> Already-open tabs from before you installed won't have the tool yet — **reload
> the tab** once. It can't run on browser-internal pages (`chrome://…`, the
> extension store, etc.).

---

## Build from source

Run from the **repo root** (not this folder):

```bash
npm install
npm run package:ext   # = build:ext, then assemble build/chromium + build/firefox
```

`build:ext` runs two bundles into `extension/dist/`:

- `content.js` + `content.css` — the scanner (injected content script).
- `background.js` — the MV3 background (a service worker on Chromium, an event
  page on Firefox — same bundle; toolbar toggle, open sign-in, Sync-Host auth
  check, sign-out, cross-origin CSS fetch).

`package-ext.mjs` then copies `dist/` + `icons/` + `fonts/` into
`build/chromium/` and `build/firefox/`, each with a browser-tailored
`manifest.json` (see [How it works](#how-it-works)). Run `npm run build:ext`
alone if you only need to refresh `dist/` while iterating.

Re-run `npm run package:ext` after changing any scanner/background code, then hit
**Reload** on the extension card. (Set the env in **Configuration** above first.)

To regenerate the icons: `node extension/scripts/gen-icons.mjs`.

---

## How it works

- **`manifest.json`** — MV3. The committed `extension/manifest.json` is the
  shared **base** (content script, toolbar button, permissions, web-accessible
  resources). `package-ext.mjs` clones it per target and rewrites only the keys
  the two browsers disagree on:
  - **Chromium** — `background.service_worker`; keeps the fixed extension `key`
    and `minimum_chrome_version`; drops `browser_specific_settings` (Firefox-only).
  - **Firefox** — `background.scripts` (Firefox runs an *event page*, never a
    service worker); keeps `browser_specific_settings.gecko` (add-on id, min
    version, the data-collection declaration AMO requires); drops `key` and
    `minimum_chrome_version` (Chromium-only).

  Splitting per target is why each folder loads with **no manifest warnings** —
  a single shared manifest would always warn in one browser (Chrome rejects the
  v2-only `background.scripts`; Firefox flags the Chromium-only keys).
- **`dist/background.js`** — the service worker (built from `src/background.ts`).
  On toolbar click it sends `sparrow-toggle` to the active tab; it also opens the
  web app for sign-in, reads the synced Clerk session (Sync Host) and writes the
  auth snapshot to `chrome.storage.local`, signs out, and re-fetches cross-origin
  stylesheets the content script can't read under CORS.
- **`dist/content.js`** — the bundled scanner. On the first toggle it mounts the
  whole UI inside a **Shadow DOM** (`#sparrow-scan-root`), so the tool's styles
  and the page's styles never interfere. Later toggles just show/hide it. Its
  `ExtensionAuthProvider` reads the auth snapshot from `chrome.storage` (and
  re-checks on tab focus) to gate the Annotate tool.
- **`dist/content.css`** — the compiled Tailwind + scanner styles, fetched into
  the shadow root at runtime (`:root` tokens are re-homed to `:host`).

### Firefox

Firefox 140+ loads its own folder, **`extension/build/firefox/`** — same
scanner/background bundles as Chromium, only the `manifest.json` differs (event
page instead of a service worker; see [How it works](#how-it-works)).

**Install (temporary):** run `npm run package:ext`, then open
`about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → pick
`extension/build/firefox/manifest.json`. Temporary add-ons are removed when
Firefox closes; for a persistent install the extension must be signed by AMO
(`web-ext sign`, or list it unlisted).

**Host permissions are opt-in on Firefox.** Unlike Chrome, Firefox does not
grant `<all_urls>` at install. The toolbar button still works everywhere
(`activeTab` + on-demand injection), and on the first click the extension asks
for full host access — grant it, or the following stay broken: auto-detecting
sign-in on the web app (cookie watch), cross-origin stylesheet recovery, and
auto-opening on `?sparrow-session` share links. You can also grant it manually
under `about:addons` → Sparrow → **Permissions**.

**Auth caveat.** The Clerk Sync Host flow works in Firefox (the Clerk SDK uses
the promise-based `browser.*` API via its bundled polyfill), but Clerk validates
the request `Origin`, and Firefox gives each **install** a random internal UUID
— so the origin to allowlist is per-machine. After installing, find the UUID on
`about:debugging` (Internal UUID) and add it to your Clerk instance's
`allowed_origins`:

```bash
curl -X PATCH https://api.clerk.com/v1/instance \
  -H "Authorization: Bearer sk_test_YOUR_SECRET_KEY" \
  -H "Content-type: application/json" \
  -d '{"allowed_origins": ["chrome-extension://mkbkmeemombaioeikegphonpbjliljbm", "moz-extension://YOUR-INTERNAL-UUID"]}'
```

(`allowed_origins` is replaced wholesale — always resend the Chrome origin too.)
That's workable for a dev/team install; for public AMO distribution every user
would have a different UUID, so signed-in Annotate isn't practical there yet —
everything else works signed-out.

### Notes

- **Auth (Clerk) is required for Annotate** — sign-in runs in the popup and the
  content script reads the session from `chrome.storage`. Annotations still save
  to `localStorage` (per-page); they're loaded on sign-in and cleared on
  sign-out. Live collaboration (Supabase) remains **compiled out** — there's no
  cross-user Share/room in the extension.
- The content script is loaded on every page but stays dormant until you click
  the icon.

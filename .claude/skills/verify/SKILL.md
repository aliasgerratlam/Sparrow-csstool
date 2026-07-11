---
name: verify
description: Build/launch/drive recipe for verifying changes to this CSS-inspector app end-to-end in a real browser.
---

# Verifying changes in this repo

## Launch

```bash
npm run dev          # Vite; picks the next free port if 5173 is busy — read the port from its output
```

`npm run typecheck` (tsc -b) is the only CI gate; it is NOT verification.

## Drive (no test runner, no Playwright in the repo)

Install `playwright-core` in the session scratchpad (NOT the project) and drive
the locally installed Edge (Chrome is not installed on this machine) — no
browser download needed:

```js
import { chromium } from 'playwright-core'
const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
})
const context = await browser.newContext({ acceptDownloads: true })
```

## Flows worth driving

- **Default page** (`/`, renders LandingPage): enable the scanner by clicking
  `.scanner-demo-toggle` (the hero "Try Demo" button toggles it).
- Mode rail buttons are `#rail-inspect`, `#rail-annotate`, `#rail-ruler`,
  `#rail-dropper` (Colors), `#rail-fonts`, `#rail-assets`.
- Panels: `#scanner-panel` (inspector), `#scanner-dropper-panel`,
  `#scanner-font-panel`, `#scanner-assets-panel`.

## Gotchas

- The scanner installs **document-level capture** mouseover/click handlers
  (`ScannerController.tsx`) that `preventDefault()` page clicks. Anything that
  must receive real clicks (panels, portals, synthetic download anchors) must
  match `SCANNER_UI_SELECTORS` there — a symptom of missing it is clicks that
  silently do nothing (e.g. anchor downloads cancelled).
- Page-wide scans skip chrome via `CHROME_SELECTOR` in `src/lib/site-colors.ts`
  — new panels need their id + class prefix added there too, or the tool scans
  its own UI.
- Downloads: use Playwright's `page.waitForEvent('download')` +
  `download.saveAs(...)`; blob-anchor downloads work fine in headless Chrome.
- Two dev servers may be running (the user often has 5173 occupied); always
  target the port your own `npm run dev` printed.

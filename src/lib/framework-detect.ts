import { CHROME_SELECTOR } from './site-colors'

/* ─────────────────────────────────────────────────────────────────────────
   Page-level CSS framework detection.

   Decides whether the *inspected page* is primarily built with Tailwind CSS,
   Bootstrap, or neither — so the inspector only exposes framework-specific UI
   (e.g. the "Copy Tailwind Classes" button) when it's actually relevant.

   Why not the existing per-class name heuristic (tailwind.ts)? Tailwind and
   Bootstrap share utility *names* (`container`, `border`, `p-3`, `text-center`,
   `bg-primary`, `w-100`, `gap-3`, `col-6`, `flex`…), so a name check alone can't
   tell them apart — a Bootstrap page trips the Tailwind path. This module scores
   only framework-*exclusive* shapes, so the two scores are near-orthogonal.

   Design constraints:
   - Lightweight & minify-robust: CSS custom-property NAMES (`--bs-primary`,
     `--tw-ring-shadow`) and author HTML class tokens both survive minification,
     and getComputedStyle reads custom props even from cross-origin sheets
     (no `.cssRules` access). We never read stylesheet text.
   - The tool injects its OWN Tailwind CSS into the page (shadow-scoped in the
     extension, light-DOM in the web build). So: (a) never trust a `--tw-*`
     computed-style probe as a sole trigger — Tailwind v4 registers `--tw-*` via
     `@property`, which can leak document-globally; (b) the whole-page class scan
     MUST skip the tool's own chrome via CHROME_SELECTOR.
───────────────────────────────────────────────────────────────────────── */

export type Framework = 'tailwind' | 'bootstrap' | 'other'

// Bootstrap 5 design tokens defined on :root. The tool never emits `--bs-*`, so
// these are an uncontaminated, O(1) fast path (readable even cross-origin).
const BS_ROOT_VARS = [
  '--bs-primary',
  '--bs-body-bg',
  '--bs-body-color',
  '--bs-border-color',
  '--bs-body-font-family',
]

// Tailwind runtime vars — a WEAK corroborator only (v4 `@property` may leak
// globally from the tool's own CSS), so it can never alone cross MIN_SIGNAL.
const TW_VARS = [
  '--tw-ring-shadow',
  '--tw-shadow',
  '--tw-translate-x',
  '--tw-border-spacing-x',
]

// Tailwind-exclusive class shapes. Tokens come from classList (already
// unescaped, e.g. `md:flex`), so raw `:` / `[…]` match. Bootstrap never emits
// a `:` variant, an `[arbitrary]` value, a leading `-`, or a `/` opacity slash.
const TW_MARK: RegExp[] = [/:/, /\[.+\]/, /^-/, /\//]

// Bootstrap-exclusive classes/shapes (covers Bootstrap 4 & 5). Tailwind is
// utility-only and uses bare `flex`/`hidden`, `justify-center`, `items-center`,
// `col-span-*` — it never emits these display/grid/component/negative forms.
const BS_MARK: RegExp[] = [
  /^d-(none|inline|block|flex|grid|table|inline-block|inline-flex|contents)$/,
  /^d-(sm|md|lg|xl|xxl)-/,
  /^col-(sm|md|lg|xl|xxl)-/,
  /^col-\d/, // col-6  (Tailwind uses col-span-* / col-start-*)
  /^(row-cols|g[xy]?)-\d/, // row-cols-2, g-3, gx-3, gy-3
  /^justify-content-/,
  /^align-(items|content|self)-/,
  /^(mt|mb|ms|me|mx|my|m)-n[1-5]$/, // Bootstrap negative margin (mt-n1)
  /^(btn|navbar|nav-link|card|form-control|form-select|form-check|input-group|dropdown|modal|carousel|accordion|alert|list-group|breadcrumb|pagination|offcanvas|spinner-border|spinner-grow|toast)(-|$)/,
]

const MAX_SCAN = 3000 // hard cap on elements walked
const CONFIDENT = 8 // score at which a dominant winner short-circuits
const MIN_SIGNAL = 3 // below this for both → 'other'

function countPresent(cs: CSSStyleDeclaration, names: string[]): number {
  let n = 0
  for (const name of names) {
    if (cs.getPropertyValue(name).trim()) n++
  }
  return n
}

function compute(): Framework {
  let twScore = 0
  let bsScore = 0

  // O(1) custom-property probes (seed scores).
  try {
    const rootCS = getComputedStyle(document.documentElement)
    if (countPresent(rootCS, BS_ROOT_VARS) >= 2) bsScore += 3 // reliable
  } catch {
    /* ignore */
  }
  try {
    if (document.body) {
      const bodyCS = getComputedStyle(document.body)
      if (countPresent(bodyCS, TW_VARS) >= 2) twScore += 1 // weak (leak risk)
    }
  } catch {
    /* ignore */
  }

  // Bounded, early-exiting page class-signature scan (author markers only,
  // uncontaminated by the tool's own chrome).
  const root = document.body
  if (root) {
    let scanned = 0
    for (const el of Array.from(root.querySelectorAll('*'))) {
      if (el.closest(CHROME_SELECTOR)) continue // skip our own UI (mandatory)
      const list = el.classList
      if (list && list.length) {
        for (const c of Array.from(list)) {
          if (TW_MARK.some((re) => re.test(c))) twScore += 2
          else if (BS_MARK.some((re) => re.test(c))) bsScore += 2
        }
      }
      if (++scanned >= MAX_SCAN) break
      // Short-circuit once one framework is a clear, dominant winner.
      if (twScore >= CONFIDENT && twScore > bsScore * 3) return 'tailwind'
      if (bsScore >= CONFIDENT && bsScore > twScore * 3) return 'bootstrap'
    }
  }

  if (twScore < MIN_SIGNAL && bsScore < MIN_SIGNAL) return 'other'
  return twScore >= bsScore ? 'tailwind' : 'bootstrap'
}

let cached: Framework | undefined

/**
 * The inspected page's dominant CSS framework. Memoized per page load — the
 * framework is a page-level property, so one cache serves every element the
 * user hovers (the hover hot-path pays nothing after the first call).
 */
export function detectFramework(): Framework {
  if (cached !== undefined) return cached
  cached = compute()
  return cached
}

/** Clear the memoized result (e.g. on scanner re-activation / SPA navigation). */
export function resetFrameworkCache(): void {
  cached = undefined
}

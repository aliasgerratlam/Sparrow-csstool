import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { setCssFetcher } from '@/lib/cross-origin-css'
import { installDevPerfGuard } from '@/lib/dev-perf-guard'
import App from './App.tsx'
import './index.css'

// React 19.2's dev-only profiler instrumentation crashes Firefox (its
// Performance API rejects React's Chrome-DevTools-specific measure calls) —
// see dev-perf-guard.ts. Must run before React renders anything.
if (import.meta.env.DEV) installDevPerfGuard()

// Recover cross-origin stylesheets that permit CORS reads (Google Fonts sends
// `Access-Control-Allow-Origin: *`), so the inspector can show their rules
// instead of an "unreadable" warning. Sheets whose server doesn't allow CORS
// still fail the fetch and keep the warning — same as before.
setCssFetcher(async (url) => {
  try {
    const res = await fetch(url, { mode: 'cors' })
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
})

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root not found')

// scripts/prerender.mjs bakes static HTML for the marketing routes into the
// build (for crawlers / social + AI bots that don't run JS). We deliberately
// CLIENT-render over that prerendered shell rather than hydrate it: this app is
// a client-only SPA with nondeterministic first-render (Clerk auth state,
// window-dependent layout, scanner overlays), so hydration mismatches (React
// error #423) are expected. React clears the shell and renders fresh on load —
// the SEO benefit lives entirely in the served HTML, so nothing is lost here.
//
// The prerendered <head> already contains the SEO tags <Seo> emits. Since we
// client-render (not hydrate), React would ADD a second copy of each, leaving
// identical duplicates in the live DOM (untidy, flagged by SEO auditors). Strip
// the baked set here so React re-adds exactly one. No-op in dev (nothing baked).
for (const tag of document.head.querySelectorAll(
  'title, meta[name="description"], meta[name="robots"], link[rel="canonical"], meta[property^="og:"], meta[name^="twitter:"]',
)) {
  tag.remove()
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

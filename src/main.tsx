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

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

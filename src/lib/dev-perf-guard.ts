/* React 19.2's dev-build "Performance Tracks" instrumentation decorates the
   Chrome DevTools profiler by calling performance.measure()/mark() with
   Chrome-specific timing options on every event-driven update. Firefox's
   Performance API is stricter and rejects some of those calls with
   `DOMException: An invalid or illegal string was specified`, thrown from
   inside React's work loop — which unmounts the whole app in dev on Firefox.
   The tracks are purely a Chrome DevTools feature, so losing a measurement
   beats losing the page: swallow the failure instead of letting it propagate.
   Dev-only — callers gate on import.meta.env.DEV, so production builds
   dead-code-eliminate this entirely. */
export function installDevPerfGuard() {
  if (typeof performance === 'undefined') return
  for (const method of ['measure', 'mark'] as const) {
    const original = performance[method] as (...args: unknown[]) => unknown
    performance[method] = ((...args: unknown[]) => {
      try {
        return original.apply(performance, args)
      } catch {
        return undefined
      }
    }) as typeof performance.measure & typeof performance.mark
  }
}

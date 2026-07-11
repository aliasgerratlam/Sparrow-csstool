import { useEffect } from 'react'
import { useScanner } from '@/context/scanner-context'
import { useAuth } from '@/context/auth-context'
import { useEntitlements } from '@/context/subscription-context'
import { resetAllElementRefonts } from '@/lib/element-refont'
import { resetAll as resetSiteRecolor } from '@/lib/site-recolor'
import { resetAllRefonts } from '@/lib/site-refont'
import { ScannerController } from './ScannerController'
import { ScannerToolbar } from './ScannerToolbar'
import { ModeRail } from './ModeRail'
import { InspectorPanel } from './InspectorPanel'
import { ColorDropper } from './ColorDropper'
import { FontPanel } from './FontPanel'
import { AssetsPanel } from './AssetsPanel'

/* Scanner chrome — only the floating UI lives here; overlays and the
   annotation layer are mounted at app level so they also work in client mode. */
export function Scanner() {
  const { isActive, mode, setMode } = useScanner()
  const { isAuthenticated, loading } = useAuth()
  const { colorMode, fontMode, assets } = useEntitlements()

  // Belt-and-suspenders: if the active mode is one the current plan can't use
  // (e.g. entitlements changed after a downgrade, or a mode was set around the
  // rail), fall back to inspect so a locked panel never renders.
  const modeLocked =
    (mode === 'dropper' && !colorMode) ||
    (mode === 'fonts' && !fontMode) ||
    (mode === 'assets' && !assets)
  useEffect(() => {
    if (modeLocked) setMode('inspect')
  }, [modeLocked, setMode])

  // Global color-overview and font edits are inline-style overrides on page
  // elements. Revert them all when the scanner is disabled so leaving
  // inspection never leaves the page permanently restyled. Edits persist
  // across mode switches (only isActive gates this, not mode).
  useEffect(() => {
    if (!isActive) {
      resetSiteRecolor()
      resetAllRefonts()
      resetAllElementRefonts()
    }
  }, [isActive])

  // In the extension the whole tool is sign-in-gated: while signed out (or auth
  // still loading) the SignInGate modal is the only chrome — hide the toolbar
  // and panels so nothing shows behind it. The web app keeps its chrome so the
  // signed-out demo works. Mirrors the same guard in ModeRail.
  const extGated =
    !!import.meta.env.VITE_IS_EXTENSION && (loading || !isAuthenticated)

  return (
    <>
      <ScannerController />
      {isActive && !extGated && (
        <>
          <ScannerToolbar />
          <ModeRail />
          {modeLocked ? (
            <InspectorPanel />
          ) : mode === 'dropper' ? (
            <ColorDropper />
          ) : mode === 'fonts' ? (
            <FontPanel />
          ) : mode === 'assets' ? (
            <AssetsPanel />
          ) : (
            <InspectorPanel />
          )}
        </>
      )}
    </>
  )
}

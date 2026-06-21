import { useScanner } from '@/context/scanner-context'
import { ScannerController } from './ScannerController'
import { ScannerToolbar } from './ScannerToolbar'
import { ModeRail } from './ModeRail'
import { InspectorPanel } from './InspectorPanel'
import { ColorDropper } from './ColorDropper'

/* Scanner chrome — only the floating UI lives here; overlays and the
   annotation layer are mounted at app level so they also work in client mode. */
export function Scanner() {
  const { isActive, mode } = useScanner()

  return (
    <>
      <ScannerController />
      {isActive && (
        <>
          <ScannerToolbar />
          <ModeRail />
          {mode === 'dropper' ? <ColorDropper /> : <InspectorPanel />}
        </>
      )}
    </>
  )
}

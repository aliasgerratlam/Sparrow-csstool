import { useEffect } from 'react'
import { ScannerProvider } from '@/context/scanner-context'
import {
  AnnotationUIProvider,
  useAnnotationUI,
} from '@/context/annotation-ui-context'
import { MarketingPage } from '@/components/marketing/MarketingPage'
import { Scanner } from '@/components/scanner/Scanner'
import { Overlays } from '@/components/scanner/Overlays'
import { AnnotationLayer } from '@/components/annotate/AnnotationLayer'
import { bootStore } from '@/boot'

// Runs once, before first render, so the store is seeded synchronously.
const boot = bootStore()

function BootEffects({ clientMode }: { clientMode: boolean }) {
  const { openSidebar } = useAnnotationUI()
  useEffect(() => {
    if (clientMode) openSidebar()
  }, [clientMode, openSidebar])
  return null
}

export default function App() {
  return (
    <ScannerProvider>
      <AnnotationUIProvider>
        <BootEffects clientMode={boot.clientMode} />
        <MarketingPage />
        <Scanner />
        <Overlays />
        <AnnotationLayer clientMode={boot.clientMode} />
      </AnnotationUIProvider>
    </ScannerProvider>
  )
}

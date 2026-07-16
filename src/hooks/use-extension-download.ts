import { useState } from 'react'
import { downloadExtension } from '@/lib/extension-download'
import { useInstallGuide } from '@/context/install-guide-context'

/* Drives the landing install CTAs: exposes a `downloading` flag for the button's
   loader/"Downloading…" state and a `download` handler that guards against
   double-clicks while a download is in flight. Once the zip is saved it pops the
   install walkthrough so the visitor knows what to do with the file. */
export function useExtensionDownload() {
  const [downloading, setDownloading] = useState(false)
  const { openGuide } = useInstallGuide()

  const download = async () => {
    if (downloading) return
    setDownloading(true)
    try {
      await downloadExtension()
      // Surface the load-unpacked walkthrough right after the file lands.
      openGuide()
    } finally {
      setDownloading(false)
    }
  }

  return { downloading, download }
}

import { useState } from 'react'
import { downloadExtension } from '@/lib/extension-download'

/* Drives the landing install CTAs: exposes a `downloading` flag for the button's
   loader/"Downloading…" state and a `download` handler that guards against
   double-clicks while a download is in flight. */
export function useExtensionDownload() {
  const [downloading, setDownloading] = useState(false)

  const download = async () => {
    if (downloading) return
    setDownloading(true)
    try {
      await downloadExtension()
    } finally {
      setDownloading(false)
    }
  }

  return { downloading, download }
}

import { extensionStoreUrl } from '@/lib/extension-download'
import { useInstallGuide } from '@/context/install-guide-context'

/* Drives the landing install CTAs: opens the extension's store listing for the
   visitor's browser (Chrome Web Store vs. Firefox Add-ons) in a new tab and
   pops the thank-you modal, which repeats the store link as a fallback in case
   the new tab was blocked. */
export function useExtensionDownload() {
  const { openGuide } = useInstallGuide()

  const getExtension = () => {
    window.open(extensionStoreUrl(), '_blank', 'noopener,noreferrer')
    openGuide()
  }

  return { getExtension }
}

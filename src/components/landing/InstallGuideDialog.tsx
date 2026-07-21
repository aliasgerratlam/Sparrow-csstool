import { ArrowUpRight, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { useInstallGuide } from '@/context/install-guide-context'
import { extensionStoreUrl } from '@/lib/extension-download'

/* Browser marks for the store button. */
import chromeIcon from '@/assets/chrome-icon.svg'
import mozillaIcon from '@/assets/mozilla-icon.svg'

/* Thank-you modal shown after a visitor clicks any "Get the Sparrow Extension"
   CTA. The click already opens the store listing in a new tab; this modal
   thanks them and repeats the same store link as a fallback (in case the new
   tab was blocked), auto-picking the Chrome Web Store or Firefox Add-ons page
   for the visitor's detected browser. */
export function InstallGuideDialog() {
  const { open, initialTab, openGuide, closeGuide } = useInstallGuide()
  const isFirefox = initialTab === 'firefox'
  const storeUrl = extensionStoreUrl(initialTab)
  const storeName = isFirefox ? 'Firefox Add-ons' : 'Chrome Web Store'

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? openGuide() : closeGuide())}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[90vh] overflow-y-auto rounded-[28px] border-2 border-sparrow-blue/60 bg-white p-8 font-abeezee sm:max-w-[520px] md:p-10"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={closeGuide}
          className="absolute right-4 top-4 inline-flex size-8 cursor-pointer items-center justify-center rounded-full text-sparrow-ink/50 transition-colors hover:bg-sparrow-ink/5 hover:text-sparrow-ink"
        >
          <X className="size-4" />
        </button>

        <DialogTitle asChild>
          <h3 className="mt-2 text-center font-pacifico text-[38px] leading-tight text-sparrow-blue">
            Thanks for choosing Sparrow!
          </h3>
        </DialogTitle>
        <DialogDescription asChild>
          <p className="mx-auto mt-2 max-w-md text-center text-[15px] leading-relaxed text-sparrow-ink/70">
            We’ve opened the {storeName} in a new tab so you can add Sparrow to
            your browser. Didn’t open? Use the button below.
          </p>
        </DialogDescription>

        <a
          href={storeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mx-auto mt-8 inline-flex items-center gap-2.5 rounded-full bg-sparrow-blue px-7 py-3.5 text-base font-bold text-white transition-colors hover:bg-sparrow-blue/90"
        >
          <img
            src={isFirefox ? mozillaIcon : chromeIcon}
            alt=""
            className="size-6 rounded-full"
          />
          Open the {storeName}
          <ArrowUpRight className="size-5" />
        </a>
      </DialogContent>
    </Dialog>
  )
}

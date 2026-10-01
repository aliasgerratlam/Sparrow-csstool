import { ArrowUpRight, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { useInstallGuide } from '@/context/install-guide-context'
import { extensionStoreUrl } from '@/lib/extension-download'
import { Logo } from '@/components/ui/Logo'

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
        overlayStyle={{
          background: 'rgba(15,23,42,0.4)',
          backdropFilter: 'blur(5px)',
          WebkitBackdropFilter: 'blur(5px)',
        }}
        className="max-h-[90vh] gap-0 overflow-y-auto rounded-3xl border border-white/95 bg-white/90 px-6 pt-11 pb-10 text-center shadow-[0_32px_64px_-28px_rgba(15,23,42,0.5)] backdrop-blur-2xl backdrop-saturate-150 sm:max-w-[500px] sm:px-12"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={closeGuide}
          className="absolute top-3.5 right-3.5 inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-[#71717a] transition-colors hover:bg-lp-blue/10 hover:text-lp-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-blue active:scale-[0.98]"
        >
          <X className="size-[18px]" strokeWidth={1.8} />
        </button>

        <span aria-hidden="true" className="mx-auto flex h-14 items-center justify-center">
          <Logo mark height={56} title="" />
        </span>

        <DialogTitle asChild>
          <h2 className="mt-6 text-[28px] leading-9 font-semibold tracking-[-0.02em] text-lp-ink">
            Thanks for choosing <span className="text-lp-blue">Sparrow</span>!
          </h2>
        </DialogTitle>
        <DialogDescription asChild>
          <p className="mx-auto mt-3 max-w-[360px] text-sm leading-[22px] text-lp-body">
            We’ve opened the {storeName} in a new tab so you can add Sparrow to
            your browser. Didn’t open? Use the button below.
          </p>
        </DialogDescription>

        <a
          href={storeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group mx-auto mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-lp-blue px-6 text-[15px] font-medium text-white transition-[background-color,transform] hover:bg-lp-blue-700 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-lp-blue active:scale-[0.98]"
        >
          <img
            src={isFirefox ? mozillaIcon : chromeIcon}
            alt=""
            className="size-5 rounded-full"
          />
          Open the {storeName}
          <ArrowUpRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </a>
      </DialogContent>
    </Dialog>
  )
}

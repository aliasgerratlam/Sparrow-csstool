import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { useInstallGuide, type InstallGuideTab } from '@/context/install-guide-context'
import { cn } from '@/lib/format'

/* ── Assets ──────────────────────────────────────────────────────────────
   Browser marks for the tabs and the per-step demo clips. All live in
   src/assets and are bundled by Vite (resolved to URLs). */
import chromeIcon from '@/assets/chrome-icon.svg'
import edgeIcon from '@/assets/edge-icon.svg'
import braveIcon from '@/assets/brave-icon.svg'
import operaIcon from '@/assets/opera-icon.svg'
import mozillaIcon from '@/assets/mozilla-icon.svg'

import chromeStep1 from '@/assets/chrome-step1.png'
import chromeStep2 from '@/assets/chrome-step2.png'
import chromeStep3 from '@/assets/chrome-step3.png'
import chromeStep4 from '@/assets/chrome-step4.png'
import firefoxStep1 from '@/assets/firefox-step1.png'
import firefoxStep2 from '@/assets/firefox-step2.png'
import firefoxStep3 from '@/assets/firefox-step3.png'
import firefoxStep4 from '@/assets/firefox-step4.png'

type GuideStep = {
  title: string
  caption: string
  image: string
}

type BrowserGuide = {
  id: InstallGuideTab
  label: string
  /** Browser marks shown inside the tab (Chromium fans out to its four builds). */
  icons: string[]
  steps: GuideStep[]
}

const GUIDES: BrowserGuide[] = [
  {
    id: 'chromium',
    label: 'Chromium',
    icons: [chromeIcon, edgeIcon, braveIcon, operaIcon],
    steps: [
      {
        title: 'Step 1',
        caption: 'Open your browser menu, then Extensions → Manage Extensions.',
        image: chromeStep1,
      },
      {
        title: 'Step 2',
        caption: 'Turn on Developer mode in the top-right corner.',
        image: chromeStep2,
      },
      {
        title: 'Step 3',
        caption: 'Click Load unpacked in the top-left.',
        image: chromeStep3,
      },
      {
        title: 'Step 4',
        caption: 'Select the unzipped Sparrow folder — you’re all set.',
        image: chromeStep4,
      },
    ],
  },
  {
    id: 'firefox',
    label: 'Firefox',
    icons: [mozillaIcon],
    steps: [
      {
        title: 'Step 1',
        caption: 'Type about:debugging in the address bar and open it.',
        image: firefoxStep1,
      },
      {
        title: 'Step 2',
        caption: 'Click This Firefox in the left sidebar.',
        image: firefoxStep2,
      },
      {
        title: 'Step 3',
        caption: 'Click Load Temporary Add-on… to open the file picker.',
        image: firefoxStep3,
      },
      {
        title: 'Step 4',
        caption: 'Select the .zip or its manifest.json — Sparrow is ready.',
        image: firefoxStep4,
      },
    ],
  },
]

export function InstallGuideDialog() {
  const { open, initialTab, openGuide, closeGuide } = useInstallGuide()
  const [tab, setTab] = useState<InstallGuideTab>(initialTab)
  // Bump on every open/tab-switch so the step videos remount and restart.
  const [runKey, setRunKey] = useState(0)
  const tabRefs = useRef<Record<InstallGuideTab, HTMLButtonElement | null>>({
    chromium: null,
    firefox: null,
  })

  // On each open, jump to the tab matching the visitor's browser and replay.
  useEffect(() => {
    if (!open) return
    setTab(initialTab)
    setRunKey((k) => k + 1)
  }, [open, initialTab])

  const active = GUIDES.find((g) => g.id === tab) ?? GUIDES[0]!

  const selectTab = (next: InstallGuideTab) => {
    setTab(next)
    setRunKey((k) => k + 1)
  }

  // Roving arrow-key focus across the two tabs (WAI-ARIA tabs pattern).
  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const order: InstallGuideTab[] = ['chromium', 'firefox']
    const step = e.key === 'ArrowRight' ? 1 : order.length - 1
    const next = order[(order.indexOf(tab) + step) % order.length]!
    selectTab(next)
    tabRefs.current[next]?.focus()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? openGuide() : closeGuide())}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[90vh] overflow-y-auto rounded-[28px] border-2 border-sparrow-blue/60 bg-white p-6 font-abeezee sm:max-w-[1140px] md:p-9"
      >
        <button
          type="button"
          aria-label="Close install guide"
          onClick={closeGuide}
          className="absolute right-4 top-4 inline-flex size-8 cursor-pointer items-center justify-center rounded-full text-sparrow-ink/50 transition-colors hover:bg-sparrow-ink/5 hover:text-sparrow-ink"
        >
          <X className="size-4" />
        </button>

        {/* Browser tabs — centered segmented pill */}
        <div
          role="tablist"
          aria-label="Choose your browser"
          className="mx-auto flex w-fit items-center gap-1.5 rounded-full bg-sparrow-blue p-1.5"
          onKeyDown={onTabKey}
        >
          {GUIDES.map((g) => {
            const selected = g.id === tab
            return (
              <button
                key={g.id}
                ref={(el) => {
                  tabRefs.current[g.id] = el
                }}
                role="tab"
                type="button"
                id={`install-tab-${g.id}`}
                aria-selected={selected}
                aria-controls={`install-panel-${g.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectTab(g.id)}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-2.5 rounded-full px-5 py-2.5 text-base font-bold transition-colors',
                  selected
                    ? 'bg-white text-sparrow-ink shadow-sm'
                    : 'text-white hover:bg-white/10',
                )}
              >
                <span className="flex items-center">
                  {g.icons.map((icon, i) => (
                    <img
                      key={i}
                      src={icon}
                      alt=""
                      className={cn(
                        'size-7 rounded-full',
                        i > 0 && '-ml-2',
                      )}
                    />
                  ))}
                </span>
                {g.label}
              </button>
            )
          })}
        </div>

        {/* Heading */}
        <DialogTitle asChild>
          <h3 className="mt-6 text-center font-pacifico text-[38px] leading-tight text-sparrow-blue">
            Thanks for the download!
          </h3>
        </DialogTitle>
        <DialogDescription asChild>
          <p className="mx-auto mt-1 max-w-2xl text-center text-[14px] text-sparrow-ink/70">
            Your Sparrow download is complete. Follow the quick steps below to load
            it into your browser.
          </p>
        </DialogDescription>

        {/* Step cards — 3-up on desktop; scroll-snap slider on mobile */}
        <div
          key={`${active.id}-${runKey}`}
          role="tabpanel"
          id={`install-panel-${active.id}`}
          aria-labelledby={`install-tab-${active.id}`}
          className="mt-8 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:snap-none md:grid-cols-4 md:overflow-visible md:pb-0"
        >
          {active.steps.map((step) => (
            <article
              key={step.title}
              className="flex shrink-0 basis-[82%] snap-start flex-col overflow-hidden rounded-2xl border border-sparrow-ink/10 bg-sparrow-ink/[0.02] sm:basis-[60%] md:basis-auto"
            >
              <div className="p-5">
                <h4 className="font-pacifico text-[28px] leading-tight text-sparrow-blue mb-5">
                  {step.title}
                </h4>
                <p className="mt-1 text-[12px] leading-relaxed text-sparrow-ink">
                  {step.caption}
                </p>
              </div>
              <img
                src={step.image}
                alt={`${step.title} preview`}
                className="mt-auto w-full object-cover"
              />
            </article>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

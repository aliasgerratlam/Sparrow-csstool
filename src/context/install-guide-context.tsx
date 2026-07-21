import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { detectBrowserTarget } from '@/lib/extension-download'

export type InstallGuideTab = 'chromium' | 'firefox'

type InstallGuideValue = {
  /** Whether the install-guide modal is currently open. */
  open: boolean
  /** The visitor's detected browser family — picks which store the modal links to. */
  initialTab: InstallGuideTab
  /** Open the thank-you modal (popped by the install CTAs on click). */
  openGuide: () => void
  /** Dismiss the modal. */
  closeGuide: () => void
}

const InstallGuideContext = createContext<InstallGuideValue | null>(null)

/* Holds the shared open-state for the post-click thank-you modal so the install
   CTAs (Hero / CTA section / footer) can pop it. Rendered once at the app root
   alongside <InstallGuideDialog />. */
export function InstallGuideProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  // Detect once at mount so the modal defaults to the tab matching the visitor's
  // browser (Firefox vs. everything-else Chromium), mirroring which zip they got.
  const [initialTab] = useState<InstallGuideTab>(() => detectBrowserTarget())

  const openGuide = useCallback(() => setOpen(true), [])
  const closeGuide = useCallback(() => setOpen(false), [])

  const value = useMemo(
    () => ({ open, initialTab, openGuide, closeGuide }),
    [open, initialTab, openGuide, closeGuide],
  )

  return (
    <InstallGuideContext.Provider value={value}>
      {children}
    </InstallGuideContext.Provider>
  )
}

export function useInstallGuide() {
  const ctx = useContext(InstallGuideContext)
  if (!ctx)
    throw new Error('useInstallGuide must be used within an InstallGuideProvider')
  return ctx
}

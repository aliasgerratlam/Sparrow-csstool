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
  /** Tab to surface first — the visitor's detected browser family. */
  initialTab: InstallGuideTab
  /** Open the guide (auto-shown after a download; also reopenable from the
      footer "Setup guide" link). */
  openGuide: () => void
  /** Dismiss the guide. */
  closeGuide: () => void
}

const InstallGuideContext = createContext<InstallGuideValue | null>(null)

/* Holds the shared open-state for the post-download install walkthrough so the
   three download CTAs (Hero / CTA section / footer) can pop it on completion and
   the footer can reopen it on demand. Rendered once at the app root alongside
   <InstallGuideDialog />. */
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

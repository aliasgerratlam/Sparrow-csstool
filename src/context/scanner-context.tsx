import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { resetFrameworkCache } from '@/lib/framework-detect'

export type ScannerMode = 'inspect' | 'annotate' | 'ruler' | 'dropper' | 'fonts' | 'assets'

interface ScannerContextValue {
  isActive: boolean
  frozen: boolean
  mode: ScannerMode
  hoveredEl: Element | null
  selectedEl: Element | null
  /** Element currently shown in the panel (hovered or frozen). */
  panelEl: Element | null
  enable: () => void
  disable: () => void
  toggle: () => void
  setMode: (mode: ScannerMode) => void
  setHovered: (el: Element | null) => void
  freeze: (el: Element) => void
  unfreeze: () => void
}

const ScannerContext = createContext<ScannerContextValue | null>(null)

export function ScannerProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false)
  const [frozen, setFrozen] = useState(false)
  const [mode, setModeState] = useState<ScannerMode>('inspect')
  const [hoveredEl, setHoveredEl] = useState<Element | null>(null)
  const [selectedEl, setSelectedEl] = useState<Element | null>(null)

  const enable = useCallback(() => {
    // Re-detect the page's framework on each activation (handles SPA route
    // changes between sessions); the result is memoized for the hover path.
    resetFrameworkCache()
    setIsActive(true)
    setFrozen(false)
    setModeState('inspect')
  }, [])

  const disable = useCallback(() => {
    setIsActive(false)
    setFrozen(false)
    setModeState('inspect')
    setHoveredEl(null)
    setSelectedEl(null)
  }, [])

  const toggle = useCallback(() => {
    setIsActive((a) => {
      if (a) {
        setFrozen(false)
        setModeState('inspect')
        setHoveredEl(null)
        setSelectedEl(null)
      }
      return !a
    })
  }, [])

  const setMode = useCallback((m: ScannerMode) => setModeState(m), [])
  const setHovered = useCallback((el: Element | null) => setHoveredEl(el), [])

  const freeze = useCallback((el: Element) => {
    setFrozen(true)
    setSelectedEl(el)
    setHoveredEl(el)
  }, [])

  const unfreeze = useCallback(() => {
    setFrozen(false)
    setSelectedEl(null)
  }, [])

  const panelEl = frozen ? selectedEl : hoveredEl

  const value = useMemo<ScannerContextValue>(
    () => ({
      isActive,
      frozen,
      mode,
      hoveredEl,
      selectedEl,
      panelEl,
      enable,
      disable,
      toggle,
      setMode,
      setHovered,
      freeze,
      unfreeze,
    }),
    [
      isActive,
      frozen,
      mode,
      hoveredEl,
      selectedEl,
      panelEl,
      enable,
      disable,
      toggle,
      setMode,
      setHovered,
      freeze,
      unfreeze,
    ],
  )

  return <ScannerContext value={value}>{children}</ScannerContext>
}

export function useScanner(): ScannerContextValue {
  const ctx = useContext(ScannerContext)
  if (!ctx) throw new Error('useScanner must be used within ScannerProvider')
  return ctx
}

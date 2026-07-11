import { createContext, useContext, type ReactNode } from 'react'

/* Where Radix primitives (Dialog / Select / Tooltip) portal their floating
   content. In the normal web app this stays `null`, so Radix defaults to
   `document.body` exactly as before. The browser-extension build runs the whole
   scanner inside a Shadow DOM and provides its own container node here, so the
   portalled content lands *inside* the shadow tree — where the injected styles
   live and where ScannerController's shadow-host check keeps clicks from leaking
   to the page. */
const PortalContainerContext = createContext<HTMLElement | null>(null)

export function PortalContainerProvider({
  container,
  children,
}: {
  container: HTMLElement | null
  children: ReactNode
}) {
  return (
    <PortalContainerContext value={container}>
      {children}
    </PortalContainerContext>
  )
}

/** Portal target for floating UI. `null` → Radix uses `document.body`. */
export function usePortalContainer(): HTMLElement | null {
  return useContext(PortalContainerContext)
}

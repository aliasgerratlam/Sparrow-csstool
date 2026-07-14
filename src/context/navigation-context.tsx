import { createContext, useContext, type ReactNode } from 'react'

/* A thin navigation bridge so components shared between the web app (which runs
   under a React Router) and the browser extension (which injects the scanner
   into host pages with NO router) can navigate safely.

   Under a Router the web app supplies react-router's `navigate` via
   <NavigationProvider> (see App.tsx → NavigationBridge), giving client-side,
   reload-free navigation. Outside a Router — the extension's shadow-DOM UI, or
   any tree without the provider — `useAppNavigate()` falls back to a full
   browser navigation, preserving the previous `<a href>` behaviour exactly.

   This file intentionally imports NOTHING from react-router, so importing it
   into the extension bundle never pulls the router in. */

type NavigateFn = (to: string) => void

const NavigationContext = createContext<NavigateFn | null>(null)

export function NavigationProvider({
  navigate,
  children,
}: {
  navigate: NavigateFn
  children: ReactNode
}) {
  return (
    <NavigationContext.Provider value={navigate}>
      {children}
    </NavigationContext.Provider>
  )
}

/** Navigate to an in-app path. Client-side (no reload) when a NavigationProvider
 *  is present; a full browser navigation otherwise. */
export function useAppNavigate(): NavigateFn {
  const ctx = useContext(NavigationContext)
  return ctx ?? ((to) => (window.location.href = to))
}

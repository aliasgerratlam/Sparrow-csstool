import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { ScannerProvider, useScanner } from '@/context/scanner-context'
import { NavigationProvider } from '@/context/navigation-context'
import {
  AnnotationUIProvider,
  useAnnotationUI,
} from '@/context/annotation-ui-context'
import { CollabProvider } from '@/context/collab-context'
import { useAuth, userDisplayName } from '@/context/auth-context'
import { AnnotationLimitSync } from '@/context/subscription-context'
import { getSessionIdFromUrl } from '@/lib/session'
import { PortalContainerProvider } from '@/lib/portal-container'
import { Scanner } from '@/components/scanner/Scanner'
import { Overlays } from '@/components/scanner/Overlays'
import { AnnotationLayer } from '@/components/annotate/AnnotationLayer'
import { store } from '@/hooks/use-annotations'
import { ExtensionAuthProvider } from './ExtensionAuthProvider'
import { ExtensionSubscriptionProvider } from './ExtensionSubscriptionProvider'
import { SignInGate } from './SignInGate'
import { MSG_OPEN_ACCOUNT } from './auth-bridge'
import '@/index.css'

/* Annotations are gated behind sign-in in the extension, so — unlike the web
   app's boot — we do NOT eagerly load them here (that would surface a stale
   review count to a signed-out user). AnnotationAuthSync loads them once the
   user authenticates and unloads on sign-out. */

// Mirrors the web app's AnnotationAuthSync: load on sign-in, clear on sign-out.
function AnnotationAuthSync() {
  const { isConfigured, isAuthenticated, loading } = useAuth()
  useEffect(() => {
    if (!isConfigured || loading) return
    if (isAuthenticated) store.reloadFromStorage()
    else store.unload()
  }, [isConfigured, isAuthenticated, loading])
  return null
}

// Mirrors the web app's AuthAuthorSync: feed the signed-in name into new
// annotations' author field (and collab identity, though collab is inert here).
function AuthAuthorSync() {
  const { user } = useAuth()
  const { setAuthor } = useAnnotationUI()
  useEffect(() => {
    setAuthor(user ? userDisplayName(user) : '')
  }, [user, setAuthor])
  return null
}

/* The extension's equivalent of the web app's BootEffects. When the page was
   opened via a live share link (?sparrow-session=<id>), the content script
   auto-mounts and ExtBridge enables the scanner in the default `inspect` mode.
   That's not enough for collaboration: peer cursors only render (and broadcast)
   in `annotate` mode, so a joiner sitting in inspect would see no cursors and no
   editing highlights. Once auth settles (annotate is sign-in gated), switch into
   annotate mode and open the review sidebar so the joiner lands in the live room.
   Guarded to run once and only for session links — a plain toolbar-click mount
   stays in inspect. */
const bootSessionId = (() => {
  try {
    return getSessionIdFromUrl()
  } catch {
    return null
  }
})()

function SessionBootEffect() {
  const { openSidebar } = useAnnotationUI()
  const { setMode } = useScanner()
  const { isConfigured, isAuthenticated, loading } = useAuth()
  const enteredRef = useRef(false)
  useEffect(() => {
    if (!bootSessionId || loading || enteredRef.current) return
    // Annotate is auth-gated; wait for sign-in (SignInGate drives the flow).
    if (isConfigured && !isAuthenticated) return
    enteredRef.current = true
    setMode('annotate')
    openSidebar()
  }, [isConfigured, isAuthenticated, loading, setMode, openSidebar])
  return null
}

/* Routes in-app navigation (e.g. the UserMenu's "Account" link) to the web app.
   The content script has no router and its window IS the host page's, so the
   default useAppNavigate() fallback (window.location.href = '/account') would
   navigate the host site — not Sparrow. Instead, ask the background worker to
   open the web app's page in a new tab. */
function ExtNavigationProvider({ children }: { children: ReactNode }) {
  const navigate = useCallback((to: string) => {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
        chrome.runtime.sendMessage(
          { type: MSG_OPEN_ACCOUNT, path: to },
          () => {
            void chrome.runtime.lastError
          },
        )
      }
    } catch {
      /* extension context invalidated — nothing to navigate. */
    }
  }, [])
  return <NavigationProvider navigate={navigate}>{children}</NavigationProvider>
}

/** Handle the content script uses to drive the scanner from the toolbar button. */
export interface ExtApi {
  toggle: () => void
  enable: () => void
  disable: () => void
}

/* Publishes the scanner controls to the content script (so the toolbar button
   can toggle the tool) and brings the scanner up once on mount — the first
   click that injects this app should show the tool, not silently arm it. */
function ExtBridge({ api }: { api: ExtApi }) {
  const { toggle, enable, disable } = useScanner()
  useEffect(() => {
    api.toggle = toggle
    api.enable = enable
    api.disable = disable
  }, [api, toggle, enable, disable])
  useEffect(() => {
    enable()
  }, [enable])
  return null
}

/* The scanner, minus the marketing/account chrome — everything the "Try Demo"
   button mounts (toolbar, mode rail, inspector/colors/fonts/assets panels,
   overlays, annotation surfaces), wrapped so Radix floating UI portals into the
   shadow root instead of the host page's <body>. */
export function ExtensionApp({
  portalContainer,
  api,
}: {
  portalContainer: HTMLElement
  api: ExtApi
}) {
  return (
    <ExtensionAuthProvider>
      <ExtensionSubscriptionProvider>
        <ScannerProvider>
          <AnnotationUIProvider>
            <CollabProvider>
              <PortalContainerProvider container={portalContainer}>
                <ExtNavigationProvider>
                  <ExtBridge api={api} />
                  <SessionBootEffect />
                  <AnnotationAuthSync />
                  <AuthAuthorSync />
                  <AnnotationLimitSync />
                  <Scanner />
                  <SignInGate />
                  <Overlays />
                  <AnnotationLayer />
                </ExtNavigationProvider>
              </PortalContainerProvider>
            </CollabProvider>
          </AnnotationUIProvider>
        </ScannerProvider>
      </ExtensionSubscriptionProvider>
    </ExtensionAuthProvider>
  )
}

import { useMemo, type ReactNode } from 'react'
import { useAuth, userPlan } from '@/context/auth-context'
import {
  SubscriptionContext,
  valueForPlan,
} from '@/context/subscription-context'

/* ─────────────────────────────────────────────────────────────────────────
   Extension subscription provider. The content script can't run the Kelviq
   React SDK (it lives on arbitrary host-page origins inside a Shadow DOM), so
   it resolves the plan from the Clerk session the background mirrors into
   chrome.storage (surfaced via ExtensionAuthProvider → useAuth). The plan id in
   publicMetadata (written by the kelviq-webhook) maps to PLAN_LIMITS, feeding
   the SAME SubscriptionContext the web app uses — so every gate (ModeRail,
   Scanner, InspectorPanel, ColorDropper, the annotation cap) works unchanged.

   Signed out → Free (fail-closed), matching the web provider.
───────────────────────────────────────────────────────────────────────── */
export function ExtensionSubscriptionProvider({
  children,
}: {
  children: ReactNode
}) {
  const { isAuthenticated, user } = useAuth()
  const value = useMemo(
    () => valueForPlan(isAuthenticated ? userPlan(user).id : 'free'),
    [isAuthenticated, user],
  )
  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  )
}

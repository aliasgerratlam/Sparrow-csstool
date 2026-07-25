/* ─────────────────────────────────────────────────────────────────────────
   Clerk config. Lives behind an env check: when the publishable key isn't set
   (no VITE_CLERK_PUBLISHABLE_KEY), `isAuthConfigured` is false and auth is
   unavailable — the app treats everyone as a guest without gating anything,
   preserving the localStorage-only prototype. This flag is independent of
   Supabase's `isCollabEnabled`: auth (Clerk) and data/realtime (Supabase) are
   configured separately.
───────────────────────────────────────────────────────────────────────── */

import type { ClerkProviderProps } from '@clerk/clerk-react'

export const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

/** True when a Clerk publishable key is present and auth is available. */
export const isAuthConfigured = !!CLERK_PUBLISHABLE_KEY

/* ─────────────────────────────────────────────────────────────────────────
   Auth-prompt deep link. The browser extension can't run Clerk on host pages,
   so its sign-in/sign-up buttons open the web app with ?sparrow-auth=<mode>;
   AuthPromptEffect (App.tsx) auto-opens the matching Clerk modal on arrival
   and strips the param. Shared here so the extension background (which builds
   the URL) and the web app (which parses it) can't drift apart.
───────────────────────────────────────────────────────────────────────── */
export const AUTH_PROMPT_PARAM = 'sparrow-auth'
export type AuthPromptMode = 'signin' | 'signup'

/* ─────────────────────────────────────────────────────────────────────────
   Extension auth token — the Clerk JWT the browser extension uses to
   authenticate quota (and other) Edge Function calls.

   Plain Clerk session tokens live only 60s and can only be minted where Clerk
   runs (the web-app tab), so the extension — which runs on arbitrary host pages
   with no Clerk and, on Firefox, no Sync Host — can't mint one on demand. The
   fix: the web app mints a LONGER-LIVED JWT-template token and pushes it to the
   extension over the auth bridge (see extension-auth-channel.ts). Our Edge
   Functions verify with `@clerk/backend` verifyToken(), which only checks the
   signature + `sub`, so a template token authenticates the same Clerk user.

   REQUIRES a Clerk JWT template named exactly this (Dashboard → JWT Templates),
   with Token lifetime = 86400s (24h). A blank template already carries `sub`;
   no custom claims are needed. Trade-off: it's a bearer credential held in
   extension storage for up to 24h — re-minted on every web-app auth push so
   active users always carry a fresh one. */
export const EXTENSION_JWT_TEMPLATE = 'extension'

/* ─────────────────────────────────────────────────────────────────────────
   Clerk appearance — makes the hosted sign-in/up modal match the Sparrow
   tool chrome (Plus Jakarta Sans, sparrow-blue accent, glassy card, the
   #4f7cff→#7c5cff gradient used on the primary buttons and mode-rail). Passed
   to <ClerkProvider appearance>. Keys mirror the theme tokens in index.css.
───────────────────────────────────────────────────────────────────────── */
export const clerkAppearance: ClerkProviderProps['appearance'] = {
  variables: {
    colorPrimary: '#1066f1', // --color-sparrow-blue
    colorPrimaryForeground: '#ffffff',
    colorForeground: '#1d1c1c', // --color-sparrow-ink
    colorMutedForeground: '#64748b',
    colorBackground: '#ffffff',
    colorInput: '#ffffff',
    colorInputForeground: '#1d1c1c',
    colorDanger: '#ef4444',
    colorSuccess: '#10b981',
    colorRing: 'rgba(79, 124, 255, 0.4)',
    colorShadow: 'rgba(30, 41, 89, 0.18)',
    colorBorder: '#e3e8f2',
    fontFamily: '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif',
    fontFamilyButtons:
      '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif',
    borderRadius: '0.625rem', // --radius
  },
  elements: {
    // Glassy card matching the toolbar / inspector panel chrome.
    card: {
      background: 'linear-gradient(180deg, #ffffff 0%, #f4f6fb 100%)',
      border: '1px solid #e3e8f2',
      boxShadow:
        '0 24px 64px rgba(30, 41, 89, 0.18), 0 2px 8px rgba(30, 41, 89, 0.08)',
    },
    headerTitle: { letterSpacing: '-0.01em', fontWeight: 700 },
    // Primary CTA reuses the signature blue→violet gradient (mode-rail / pins).
    formButtonPrimary: {
      background: 'linear-gradient(135deg, #4f7cff 0%, #7c5cff 100%)',
      boxShadow: '0 2px 8px rgba(59, 107, 255, 0.35)',
      textTransform: 'none',
      fontWeight: 700,
      transition: 'transform 0.12s, box-shadow 0.12s',
      '&:hover': {
        boxShadow: '0 4px 12px rgba(59, 107, 255, 0.45)',
        transform: 'translateY(-1px)',
      },
    },
  },
}

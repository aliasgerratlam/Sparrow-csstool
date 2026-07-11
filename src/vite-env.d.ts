/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Compile-time flag set only by the extension content build ("1"). */
  readonly VITE_IS_EXTENSION?: string
  /** Extension: origin whose Clerk cookies to sync + the web app URL it opens. */
  readonly VITE_EXT_SYNC_HOST?: string
  readonly VITE_EXT_WEB_APP_URL?: string
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Kelviq CLIENT (publishable) API key — safe in the browser; used by the
      React SDK for live entitlement reads. The SERVER key and webhook signing
      secret are server-only Supabase function secrets, never VITE_ vars. */
  readonly VITE_KELVIQ_CLIENT_KEY?: string
  /** Kelviq product id the plans/features live under. */
  readonly VITE_KELVIQ_PRODUCT_ID?: string
  /** Kelviq environment: 'sandbox' (default) or 'live'. */
  readonly VITE_KELVIQ_ENV?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

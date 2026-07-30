# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev        # Vite dev server
npm run build      # tsc -b (project references) && vite build
npm run typecheck  # tsc -b --noEmit — strict, run this to verify changes
npm run preview    # serve the production build
```

There is **no test runner and no linter/formatter configured** — `typecheck` is the only automated gate. TypeScript is strict and uses composite project references (`tsconfig.app.json` + `tsconfig.node.json`), so `tsc -b` is required (plain `tsc` won't work).

Import alias: `@/` → `src/` (configured in both `vite.config.ts` and `tsconfig`).

## What this is

A browser-based CSS inspector + annotation/review tool. Hover any element to see its matched author CSS rules (DevTools-style cascade), computed box, and fonts; drop annotation pins; review them in a sidebar; and share a live collaboration link. It was refactored from a single-file vanilla-JS prototype, preserved at [reference/original.html](reference/original.html) — **treat that file as the behavioral source of truth** when a behavior is ambiguous.

## Runtime entry modes

Routing is manual (no router lib) — [src/App.tsx](src/App.tsx) reads `window.location`:

- **Index (`/`)** — renders `LandingPage` with the scanner/annotate chrome layered on top (the hero "Try Demo" inspects this page in place).
- **`/account`** — renders `AccountPage` alone (Clerk profile + subscription management). Static hosting must rewrite unknown paths to `index.html` so this resolves on hard refresh.
- `?sparrow-session=<id>` — joins a live collaboration room. Annotate is auth-gated: if Clerk auth is configured and the user is not signed in, the scanner enables and Clerk's hosted sign-in modal opens; entry into `annotate` mode completes once `isAuthenticated` flips (the `BootEffects` effect re-runs).
- `?sparrow-auth=signin|signup` — auto-opens the Clerk modal (used by the extension's sign-in deep link).

`bootStore()` runs once **before first render** so the annotation store is seeded synchronously.

## Architecture

The inspection engine is deliberately framework-agnostic (kept portable for a future browser extension). React only handles rendering and event wiring.

- **`src/lib/`** — pure logic, no React. The core is [cssom.ts](src/lib/cssom.ts): it walks `document.styleSheets`, classifies each matched selector (resting vs. state pseudo-class vs. pseudo-element), computes specificity, tracks cascade order, and serializes declarations by parsing `cssText` (not iterating `style[i]`, which expands shorthands). [tailwind.ts](src/lib/tailwind.ts) detects utility classes and builds an applied-CSS view. Also: selector-engine, extractors, color, share-codec, lz-string, session + session-api (Supabase sessions), supabase client, annotation-mapper (row ↔ domain).
- **`src/store/annotations-store.ts`** — a framework-agnostic external store (subscribe/emit + `localStorage` + Supabase mirror), consumed via `useSyncExternalStore` through [src/hooks/use-annotations.ts](src/hooks/use-annotations.ts). Writes replace the `items` array immutably so reference-equality change detection works. Mutations update locally first, then mirror to Supabase; inbound realtime changes call `applyRemote*` which mutate without writing back (upsert-by-id makes our own echoes idempotent).
- **`src/context/`** — React state via `useContext`: `scanner-context` (active/frozen/mode/hovered/selected; `panelEl` = frozen ? selected : hovered), `annotation-ui-context` (card/sidebar/share/author/flash), `collab-context` (the realtime channel), `auth-context` (a thin adapter over Clerk — wraps `ClerkProvider`, normalizes the Clerk user into `AuthUser`, and exposes `openLoginDialog` → Clerk's hosted sign-in modal), `subscription-context` (SDK-free entitlements context + `useEntitlements()`; the web provider is `kelviq-provider.tsx`).
- **`src/hooks/`** — `use-css-inspection` (memoized rule view-model — the bridge from `cssom`/`tailwind` output to renderable blocks), `use-element-rect`, `use-draggable`.
- **`src/components/`** — `ui/` (shadcn new-york primitives), `scanner/` (toolbar, mode rail, overlays, inspector panel, and `ScannerController` — the central document-event controller), `annotate/` (pin layer, card, sidebar, share dialog, cursor/editing overlays for collab), `landing/` + `marketing/` (static pages), `auth/`.

### Subscriptions & feature gating (Kelviq)

Recurring subscriptions (Free / Pro / Max, monthly + yearly) run on **Kelviq**, a Merchant-of-Record billing platform (hosted checkout + customer portal + tax + 135+ currencies). It's **optional**: without `VITE_KELVIQ_CLIENT_KEY` / `VITE_KELVIQ_PRODUCT_ID` (`isKelviqConfigured` in [src/lib/kelviq.ts](src/lib/kelviq.ts)), the app runs fully ungated (prototype behaviour). Kelviq also needs Supabase configured, since checkout/portal/webhook run in Edge Functions.

- **Canonical plan/feature model:** [src/lib/plans.ts](src/lib/plans.ts) — `PlanId` (`free|pro|max`), `FEATURE_IDS` (must match the Kelviq dashboard), `PLAN_LIMITS` (per-tier capabilities + numeric annotation cap), and pricing-card display copy. Shared by web app + extension.
- **Gating source of truth:** live Kelviq entitlements via the React SDK ([kelviq-provider.tsx](src/context/kelviq-provider.tsx)), so access reflects renewals / cancellations / failed-payment expiry automatically. `useEntitlements()` ([subscription-context.tsx](src/context/subscription-context.tsx)) is the single hook every gate reads; it fails **closed** (Free) while loading / signed out, and is **ungated** only when Kelviq is unconfigured. The extension can't run the SDK on host pages, so [ExtensionSubscriptionProvider](extension/src/ExtensionSubscriptionProvider.tsx) resolves the plan from the id the webhook mirrors into Clerk metadata (`userPlan()`).
- **The five gates:** color-format toggle ([InspectorPanel](src/components/scanner/InspectorPanel.tsx)/[ColorDropper](src/components/scanner/ColorDropper.tsx)), Color/Font/Assets modes (locked at [ModeRail](src/components/scanner/ModeRail.tsx), with a [Scanner](src/components/scanner/Scanner.tsx) fallback to inspect), and the annotation cap.
- **Annotation cap = per-user + per-domain, server-authoritative** (Free 3 / Pro 10 / Max unlimited). The Kelviq `annotations-limit` entitlement supplies only the cap number; the **count + reset live on the backend**, keyed to the verified Clerk user id — so the cap survives a localStorage clear / incognito and can't be reset from devtools (the old client-side `localStorage` ledger, now removed, couldn't guarantee this). Data model: one counter row per (user, domain) in `annotation_quota` + two SECURITY DEFINER RPCs (`reserve_annotation` / `get_annotation_quota`) in [supabase/schema.sql](supabase/schema.sql), fronted by the [annotation-quota](supabase/functions/annotation-quota/index.ts) Edge Function (`x-clerk-token` auth via `_shared/clerk.ts`; cap resolved server-side via `_shared/plans.ts`). **Reset = fixed 24h from exhaustion:** the whole quota returns to 0 exactly 24h after the cap is hit (no countdown before then). The client helper is [src/lib/annotation-quota-api.ts](src/lib/annotation-quota-api.ts); the store's async `add()` calls `reserveAnnotation()` as the authoritative gate and **fails closed** (blocks) when signed-in + gating is on but the credit can't be confirmed (no token / backend unreachable), so the cap can't be bypassed by blocking the check — there is no local ledger. (`invoke()` retries `getToken()` briefly first, since Clerk's session can settle a beat after auth reports signed-in.) Backend applies only when signed-in AND gating is on (`AnnotationQuotaSync` in [subscription-context.tsx](src/context/subscription-context.tsx)); unconfigured = ungated prototype.
- **Checkout / management:** [kelviq-checkout.ts](src/lib/kelviq-checkout.ts) invokes the Edge Functions `kelviq-checkout` (new sub → hosted checkout), `kelviq-subscription` (upgrade/downgrade/cancel), and `kelviq-portal` (self-serve invoices/payment methods, **and resume** — Kelviq has no resume API, so reversing a scheduled cancel routes through the portal). [kelviq-webhook](supabase/functions/kelviq-webhook/index.ts) verifies Kelviq's signature, upserts the `subscriptions` table, and mirrors the plan into Clerk metadata. Server keys are Supabase secrets (`KELVIQ_SERVER_KEY`, `KELVIQ_WEBHOOK_SECRET`), never `VITE_`. Dashboard setup + feature ids are documented in `.env.example` and the implementation plan.

### CSS inspection data flow

`useCssInspection(element)` → `getMatchedRules` (all matching author rules) → split into Tailwind view (if the element has utility classes) **or** plain view. Plain view buckets rules into applied (resting, active media — cascade-sorted, winner on top, with `overridden` flags via a `seen` set), state (`:hover` etc.), pseudo-element (`::before`), and inactive-media blocks; inline `element.style` is prepended as the top applied block.

### Collaboration (optional — Supabase)

Supabase is **optional** and now scopes **only data + realtime** (annotations, sessions, collab) — authentication moved to Clerk. Without `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (see `.env.example` → `.env.local`), `isCollabEnabled` is false and every collab path is an inert passthrough — the app runs localStorage-only, exactly like the prototype. The DB schema (tables, RLS, realtime publication, expired-session sweep cron) lives in [supabase/schema.sql](supabase/schema.sql); run it once in the Supabase SQL editor. RLS is intentionally open (anon key), so Supabase queries do **not** depend on the Clerk session.

### Auth & accounts (optional — Clerk)

Auth is **optional** and independent of Supabase (`isAuthConfigured` vs `isCollabEnabled` are separate flags — see [src/lib/clerk.ts](src/lib/clerk.ts)). Without `VITE_CLERK_PUBLISHABLE_KEY`, `AuthProvider` skips `ClerkProvider` and supplies a guest context (`isConfigured:false`), so nothing is gated. When set, [auth-context.tsx](src/context/auth-context.tsx) wraps children in `ClerkProvider` and bridges Clerk's hooks into the existing `useAuth()` contract. Sign-in/sign-up run through Clerk's **hosted modal** (`openLoginDialog` → `clerk.openSignIn()`); email/password + Google are enabled in the Clerk dashboard. The signed-in user is normalized into a stable `AuthUser` shape; `userDisplayName`/`userPlan` read from it (plan/billing lives in Clerk `publicMetadata`). Only a display-name string flows into annotations (via `AuthAuthorSync` in [App.tsx](src/App.tsx)).

Key concepts:
- **Session = a shareable room.** Its id travels in `?session=<id>` and keys the realtime channel (`annot:<id>`), so live collab is only possible with the link. Sessions expire per the creator's plan (see the share-link expiry section below) and are hard-deleted by a `pg_cron` sweep; annotations are **page-scoped** in a separate table and survive session deletion.
- **`canonicalPageUrl()`** (in [session.ts](src/lib/session.ts)) strips `?session=` and the hash so host and joiners agree on the page identity that scopes annotations and the realtime filter — critical, or the two sides never sync.
- **Roles** (`author` / `client`, in the store): only `author` can add/remove annotations; a `client` may only change `status` (see `CLIENT_WRITABLE`). `canEdit` further restricts comment edits to the recorded author.
- **Host** = whoever created the session (tracked in `localStorage`, `isSessionHosted`), independent of edit permissions. Only the host mints links. `active` is a best-effort "room empty" hint, not a revocation — reopening a non-expired link revives the room (but does **not** extend its expiry).
- **Share-link expiry = per-plan, server-stamped, fixed at creation** (Free 24h / Pro 30d / Max never). The duration comes from `PLAN_LIMITS[*].shareExpiryMs` in [plans.ts](src/lib/plans.ts) (**derived from the plan id — not a Kelviq entitlement**, so no dashboard config), mirrored server-side as `SHARE_EXPIRY_MS` in [_shared/plans.ts](supabase/functions/_shared/plans.ts) (`src/lib/plans.test.ts` guards the drift). The **security boundary is Postgres, not the Edge Function**: the `enforce_session_expiry` trigger in [schema.sql](supabase/schema.sql) clamps any anon insert to 24h and *pins* `expires_at` on UPDATE (trust is keyed on `current_user`, since PostgREST removed the singular JWT-claim GUCs and `sb_publishable_*` keys aren't JWTs). That makes the [session-create](supabase/functions/session-create/index.ts) Edge Function an **elevator** to 30d/never rather than a gate — so `mintSession()` in [session-api.ts](src/lib/session-api.ts) **fails open to a 24h anon insert** (signed out, prototype mode, no Clerk token on Firefox, function down) and reports `degraded`. `null` `expires_at` = never expires; the app's in-memory sentinel is `Infinity`, which must never be JSON-serialized. Lifetime is written **once** — `reactivateSession` deliberately no longer re-leases it, and an upgrade/downgrade never moves an existing link. Because links now really do die, `collab-context` also carries a `sessions` **DELETE** subscription and an in-session expiry timer (chunked — 30 days overflows `setTimeout`'s 32-bit delay), and an expired/missing row resets the **host** to no-session instead of leaving them with a stale link and no banner.

### Site-wide recolor & refont

Two more scanner modes (`SiteColorOverview.tsx`, `SiteFontOverview.tsx`, `ColorDropper.tsx`, `GoogleFontPicker.tsx`) let a user swap every occurrence of a scanned color or font across the page, not just one element's rule. [site-colors.ts](src/lib/site-colors.ts)/[site-fonts.ts](src/lib/site-fonts.ts) scan the page once into a `SiteColor`/`SiteFont` list (each usage = element + CSS property); [site-recolor.ts](src/lib/site-recolor.ts)/[site-refont.ts](src/lib/site-refont.ts) apply an override by writing `!important` inline styles to every usage (never touching author stylesheets), snapshotting the prior inline value so reset is exact. Re-applying for the same key first reverts the previous override, so repeated edits stay exact. Fonts can come from Google Fonts ([google-fonts.ts](src/lib/google-fonts.ts) + [src/data/google-fonts.json](src/data/google-fonts.json), loaded on demand and awaited before swapping to avoid a flash of fallback) or user uploads ([custom-fonts.ts](src/lib/custom-fonts.ts), registered via `FontFace`). Per-element (as opposed to site-wide) recolor/refont lives in `element-colors.ts`/`element-refont.ts`; [preview.ts](src/lib/preview.ts) underlies the live-preview-before-commit interaction pattern shared by both tools.

### Styling

Tailwind v4 (via `@tailwindcss/vite`, no config file) + shadcn primitives for behavior/accessibility. The distinctive look (glassy chrome, gradient pins, dashed guides) lives in [src/index.css](src/index.css) as **unlayered CSS**, which intentionally overrides Tailwind's layered utilities. shadcn config (`components.json`) is new-york style, slate base, `utils` alias points at `@/lib/format`.

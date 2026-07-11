# CSS Scanner

A browser-based CSS inspector + annotation/review tool. Hover any element to see
its matched CSS rules, computed dimensions and fonts; drop annotation pins,
review them in a drawer, and share a read-only review link.

Refactored from a single-file vanilla-JS prototype to **React + TypeScript**
(Vite, Tailwind v4, shadcn/ui). The original prototype is preserved at
[reference/original.html](reference/original.html) as the behavioral source of truth.

## Scripts

```bash
npm install
npm run dev        # Vite dev server
npm run build      # tsc -b && vite build
npm run typecheck  # strict type check, no emit
```

## Architecture

The inspection logic is framework-agnostic and isolated from React; only
rendering and event wiring are React.

```
src/
  lib/        Pure logic (no React): CSSOM traversal, Tailwind detection,
              extractors, selector engine, LZ compression, share codec, preview.
  store/      annotations-store.ts — external store (subscribe/emit + localStorage
              + author/client roles), consumed via useSyncExternalStore.
  hooks/      use-annotations (store bridge), use-css-inspection (memoized rule
              view-model), use-element-rect, use-draggable.
  context/    scanner-context (active/frozen/mode/hovered/selected),
              annotation-ui-context (card/sidebar/share/author/flash).
  components/
    ui/         shadcn primitives (button, input, textarea, select, dialog).
    scanner/    toolbar, mode rail, overlays, inspector panel, CSS-rules view,
                and the document-event controller.
    annotate/   pin layer, annotation card, review sidebar, share dialog, banner.
    marketing/  the static sample page the scanner inspects.
```

### Notes
- **State**: scanner state is shared via `useContext`; the annotation list is an
  external store read with `useSyncExternalStore` (no extra state library).
- **Styling**: shadcn primitives provide behavior/accessibility; the distinctive
  look (glassy chrome, gradient pins, dashed guides) lives in `index.css` as
  *unlayered* CSS, which intentionally overrides Tailwind's layered utilities.
- **Live sessions**: the author starts a session from the Share menu to mint a
  unique link (`?session=<id>`). Opening it joins that live room (presence,
  cursors, real-time edits) in client review mode. Collaboration is only possible
  through the link; it is invalidated once everyone leaves. Requires Supabase
  (see `supabase/schema.sql`); without it the app runs localStorage-only.
- **Auth**: authentication uses **Clerk** and is independent of Supabase. Set
  `VITE_CLERK_PUBLISHABLE_KEY` (see `.env.example`) and enable Email+Password and
  the Google connection in the Clerk dashboard; sign-in uses Clerk's hosted modal.
  Without the key, auth is disabled and everyone is treated as a guest.

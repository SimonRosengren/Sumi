# 17. Web stack: Vue 3, Tailwind 4, shadcn-vue, Geist

- Status: accepted
- Date: 2026-10-29

## Context

[ADR 0005](0005-vue-for-web.md) chose Vue 3 with Vite. The board needs a component library and a visual identity. The owner asked for shadcn's look, a fixed color palette, and the Geist font. shadcn/ui itself is React-only.

## Decision

- **shadcn-vue**, the Vue port of shadcn/ui (Reka UI primitives plus Tailwind), for components. Components are copied into `packages/web/src/components/ui/` by its CLI and owned by us, so they are excluded from lint and not edited by hand.
- **Tailwind CSS 4** (`@tailwindcss/vite`), configured in CSS. The palette is defined once as CSS variables and mapped onto shadcn's semantic tokens; see [design.md](../design.md).
- **Geist and Geist Mono** via `@fontsource-variable/*`, self-hosted, so the app works offline and loads no third-party fonts.
- **@lucide/vue** for icons, **vue-tsc** for typechecking, **Vitest** with **@vue/test-utils** and happy-dom for component tests.
- **No Pinia and no router yet.** The board's state is one composable; there is one screen besides login. Add them when a second screen or shared state needs them (ADR 0005 already allows Pinia).
- **API access through a same-origin `/api` path.** The Vite dev server proxies `/api` to the API (`SUMI_API_URL`, default `http://localhost:3000`), so the API needs no CORS configuration. How `/api` is served in production is decided with the Docker milestone.
- **Sign-in by pasting an API token** for now, stored in `localStorage`. It is replaced by GitHub OAuth (ADR 0006). `localStorage` tokens are readable by any script on the page, which is acceptable only until sessions with `HttpOnly` cookies exist.
- `exactOptionalPropertyTypes` is turned off for `packages/web` only. Vue and Reka UI component prop types do not satisfy it, and the generated components would fail to typecheck. All other packages keep it on.
- `eslint-plugin-vue` (the `essential` preset only, since there is no formatter) so `.vue` files are linted and the package boundary rules apply to them.

## Consequences

- We own the component code and can restyle it, at the cost of not receiving upstream fixes automatically.
- The shadcn-vue CLI needs Node 24 (Node 22.13 lacks `zlib` zstd). Day-to-day development needs only Node 22.12+.
- The generated components pull in `@vueuse/core` and `cn`.
- The palette's oranges fail contrast with white text (2.4 to 3.3:1), so accents always carry dark text (5.1 to 7.1:1); this is recorded in [design.md](../design.md).

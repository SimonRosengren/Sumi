# 35. Public website: VitePress in `packages/site`

- Status: accepted
- Date: 2026-11-02

## Context

The README is the only landing page and ranks poorly in search (SUMI-17). Reference for structure: vercel.com. Palette stays ours and may change.

## Decision

| Topic | Choice |
| --- | --- |
| Location | `packages/site`, in this repo (it renders `docs/`) |
| Generator | VitePress, the one new dependency. No Nuxt, Astro, router, Pinia, CMS or analytics |
| Source | `srcDir: ../../docs`, config in `packages/site`. `docs/index.md` is front matter only |
| Docs pages | VitePress default theme, `--vp-c-*` mapped to our tokens |
| Landing page | Vue component, Tailwind 4 (theme and utilities only, no preflight) |
| Tokens | Copied from `packages/web/src/style.css`. A test fails on drift. Semantic tokens only, no hex in components |
| Boundary | Imports no `@sumi/*` package; none imports it. ESLint enforces it |
| Hero demo | Vue component with a mock board, not a video. Exempt from "nothing moves on its own"; honors `prefers-reduced-motion` |
| Agent files | `/llms.txt`, `/get-started.md` |
| Hosting | GitHub Pages via Actions, only on `docs/**` and `packages/site/**`. `SITE_BASE` and `SITE_URL` make a custom domain a config change |
| Design rules | Marketing tier in [design.md](../design.md#marketing-site) |

## Consequences

- Palette changes are made twice (app, then site) until a shared tokens package is worth it.
- Links from `docs/` to source files are rewritten to GitHub at build time.
- Dockerfile copies `packages/site/package.json` so the frozen lockfile resolves. The image does not build the site.
- The default theme can be replaced later without touching `docs/`.

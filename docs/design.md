# Design

How the web UI looks. Follow this so the board stays consistent. Stack and rationale: [ADR 0017](adr/0017-web-stack.md).

## Palette

These six colors are the only hard-coded colors. They live as `--sumi-*` variables at the top of `packages/web/src/style.css`; everything else is derived from them with `color-mix`.

| Role | Hex | Variable |
| --- | --- | --- |
| Light / white | `#E7E7D8` | `--sumi-light` |
| Dark / black | `#1E1E1D` | `--sumi-dark` |
| Secondary | `#AEAC95` | `--sumi-secondary` |
| Accent 1 | `#F09235` | `--sumi-accent-1` |
| Accent 2 | `#ED762F` | `--sumi-accent-2` |
| Accent 3 | `#EC642B` | `--sumi-accent-3` |

Light theme: light background, dark text, primary = accent 2. Dark theme: dark background, light text, primary = accent 1. The theme follows the system until the user toggles it; the choice is stored in `localStorage` (`sumi.theme`) and applied before first paint by the inline script in `index.html`.

## Rules

- **Use semantic tokens, not hex.** Write `bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`; never a hex value or a raw Tailwind palette color such as `bg-orange-500`. Change the look by editing the variables in `style.css`.
- **Text on an accent is always the dark color.** White on the three oranges is only 2.4 to 3.3:1 contrast (below the 4.5:1 minimum); dark `#1E1E1D` on them is 5.1 to 7.1:1. That is why `--primary-foreground` is dark in both themes.
- **Secondary text uses `text-muted-foreground`**, which is derived to keep readable contrast. Do not use `--sumi-secondary` directly for text on the light background (1.8:1; on the dark background it is fine at 7.3:1).
- **Status colors** run from neutral to deep orange as work progresses (`bg-status-backlog` ... `bg-status-done`, defined in `@theme`). The status icon is in `StatusIcon.vue`.
- **Agents vs humans:** agent avatars show a bot icon on an accent tint; humans show initials on the secondary tint.

## Typography

Geist (sans) and Geist Mono, self-hosted through `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` (SIL OFL). Use the mono font for keys, branches and code (`font-mono`). No webfont CDN.

**Be bold with headings.** Geist looks best heavy, so headings use the top of the weight range: page and card titles `font-black` with `tracking-tight` (e.g. "Sign in", the empty state), column headers `font-extrabold`, ticket titles `font-bold`, small labels such as priority `font-semibold`. Body text stays regular. Do not use `font-medium` for anything that is meant to stand out.

## Logo

Temporary, in `AppWordmark.vue`: the Lucide `Origami` icon (stroke 2.5, primary color) and the word SUMI, uppercase, Geist Black 20px, letter spacing -7% (`tracking-[-0.07em]`), 8px gap (`gap-2`). Replace it there when a real logo exists.

## Components

- UI primitives come from **shadcn-vue**. Add one with `pnpm dlx shadcn-vue@latest add <name>` run inside `packages/web` (it needs Node 24; Node 22.13 fails). They land in `src/components/ui/`, which is generated: do not hand-edit them or lint them. Restyle through the tokens instead.
- Our own components are in `src/components/` and `src/views/`. Component names must be multi-word.
- Icons: `@lucide/vue`.
- The generated components import `cn` from the `cn` package (shadcn's replacement for `clsx` + `tailwind-merge`).

## Checking a change visually

Typecheck and unit tests do not catch layout problems. For UI changes, run the API and `pnpm --filter @sumi/web dev` with some seeded tickets, and look at the board in both themes and at a narrow (390px) width.

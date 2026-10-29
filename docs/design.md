# Design

How the web UI looks. Follow this so the board stays consistent. Stack: [ADR 0017](adr/0017-web-stack.md). Look: [ADR 0025](adr/0025-visual-design-language.md).

## Palette

Warm neutrals for surfaces, one orange accent with a narrow job. Defined as explicit tokens at the top of `packages/web/src/style.css` (the only place hex values are allowed). Rationale: [ADR 0025](adr/0025-visual-design-language.md).

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `background` | `#F7F6F3` | `#151514` | page, header (no divider, seamless with the board) |
| `card` / `popover` | `#FDFCFB` | `#21211F` / `#262624` | cards, dialog, inputs |
| `muted` | `#EFEDE8` | `#1B1B19` | column trays, skeletons |
| `accent` | `#EBE9E3` | `#2C2C2A` | **neutral hover surface** (shadcn's name; not the brand accent) |
| `border` / `input` | `#E7E5DF` / `#D9D6CE` | `#31302D` / `#383734` | hairlines / control borders |
| `foreground` | `#1C1B19` | `#EDECE7` | text |
| `muted-foreground` | `#6B6860` | `#A09E96` | metadata, labels (4.7:1 or better on the page, cards and trays) |
| `primary` | `#ED762F` | `#F09235` | the accent |
| `primary-ink` | `#B5470C` | `#F09235` | the accent as text (5.0:1 on the page in light) |
| `destructive` | `#B3402F` | `#E0705E` | errors, high priority |

Status (the five default lanes; any other lane gets a plain `status-todo` circle): `status-backlog`, `status-todo` (neutral), `status-in-progress` (blue), `status-in-review` (violet), `status-done` (green), all muted. Priority: `priority-low` (neutral), `priority-medium` (amber), `priority-high` (the destructive red).

The theme follows the system until the user toggles it; the choice is stored in `localStorage` (`sumi.theme`) and applied before first paint by the inline script in `index.html`.

## Rules

- **Use semantic tokens, not hex.** Write `bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`; never a hex value or a raw Tailwind palette color. Change the look by editing `style.css`.
- **The accent has a job.** Use `primary` only for: primary buttons, the active navigation item (`bg-primary/12` tint, key in `text-primary-ink`), focus rings and borders, selected or drop-target states (a tint such as `bg-primary/10`), and links (`text-primary-ink`). Not for icons, avatars, headings, badges, hover states or the logo. Hover is always neutral (`bg-accent`).
- **Text on a filled accent is dark** (`--primary-foreground`): white on the orange is only about 2.9:1, dark is 5.9:1.
- **Secondary text uses `text-muted-foreground`.** Anything smaller than 12px is only for monospace keys and avatar initials.
- **Status and priority are signals, not decoration:** small icons in muted colors (`StatusIcon.vue`, `PriorityIcon.vue`), never filled badges.
- **Agents vs humans:** humans are round avatars with initials, agents are square with a bot icon, both neutral.
- **One radius scale:** controls `rounded-md` (6px), cards and trays `rounded-md` / `rounded-lg` (6 / 8px), the dialog `rounded-xl` (12px). No shadows except the dialog's.
- **Focus is always visible and uses the accent:** `focus-visible:ring-2 ring-ring/30..40`, plus `border-ring` on inputs and cards.
- **Disabled** primary buttons turn neutral (`bg-muted`); other variants fade to 50%.

## Typography

Geist (sans) and Geist Mono, self-hosted through `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` (SIL OFL). Mono is for keys, branches and code (`font-mono`). No webfont CDN.

Base text is 14px (`text-sm`). Scale in use:

| Role | Classes |
| --- | --- |
| Page or dialog title | `text-lg font-semibold tracking-tight` |
| Column header | `text-[13px] font-semibold tracking-tight` |
| Ticket title on a card | `text-[13px] font-medium leading-snug` |
| Body, description | `text-sm`, `leading-relaxed` for long text |
| Field and activity text | `text-[13px]` |
| Section label | `text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground` |
| Metadata (keys, counts, timestamps) | `text-xs` or `font-mono text-[11px]`, `text-muted-foreground` |

Use `font-semibold` for headings and `font-medium` for emphasis; avoid `font-black` except in the wordmark.

## Logo

Temporary, in `AppWordmark.vue`: the Lucide `Origami` icon (stroke 2.5, text color, not the accent) and the word SUMI, uppercase, Geist Black 20px, letter spacing -7% (`tracking-[-0.07em]`), 8px gap (`gap-2`). Replace it there when a real logo exists.

## Interaction

- The header has no divider or background of its own: it and the board are one seamless surface (`bg-background`). Keep it that way.
- Cards are draggable between columns; the target column gets an accent tint and border while a card is over it. Cards are also keyboard-focusable and open the detail panel with Enter or click.
- The ticket detail is a centered modal (nearly full width on narrow screens, scrolls when tall) with native `<select>` fields styled like inputs (custom chevron, `appearance-none`). Titles and descriptions are edited in place in an edit mode (pencil button, Save/Cancel), and tickets are created from the "New ticket" button in the header, in a modal of the same look ([ADR 0026](adr/0026-create-and-edit-tickets-in-the-web-ui.md)). Anything draggable also needs a non-drag way to do it (the status select), because touch screens cannot drag.
- **Edit lanes** is a mode, switched on by the "Edit lanes" header button (which becomes "Done"). In it, lane headers show a grip, a pen (rename in place) and a trash button, can be dragged by their name (the target lane gets the accent tint), and a slim dashed "+ Add" placeholder sits at the far right ([ADR 0028](adr/0028-editable-lanes.md)). Lanes have no non-drag way to be reordered yet.

## Components

- UI primitives come from **shadcn-vue**. Add one with `pnpm dlx shadcn-vue@latest add <name>` run inside `packages/web` (it needs Node 24; Node 22.13 fails). They land in `src/components/ui/`, which is not linted. We own that code and have tuned `button`, `badge`, `input`, `card`, `skeleton` and `tooltip` for [ADR 0025](adr/0025-visual-design-language.md); re-adding one overwrites the tuning, so check `git diff` afterwards. Prefer changing tokens over editing components.
- Our own components are in `src/components/` and `src/views/`. Component names must be multi-word.
- Icons: `@lucide/vue`.
- The generated components import `cn` from the `cn` package (shadcn's replacement for `clsx` + `tailwind-merge`).

## Checking a change visually

Typecheck and unit tests do not catch layout problems. For UI changes, run the API and `pnpm --filter @sumi/web dev` with some seeded tickets, and look at the board in both themes and at a narrow (390px) width.

# Design

How the web UI looks. Follow this so the board stays consistent. Stack: [ADR 0017](adr/0017-web-stack.md). Look: [ADR 0025](adr/0025-visual-design-language.md). Structure (type, spacing, motion, elevation, states, enforcement): [ADR 0031](adr/0031-structural-design-tokens-and-enforcement.md).

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
| `scrim` | black 30% | black 50% | backdrop behind dialogs (`bg-scrim`) |

Status (the five default lanes; any other lane gets a plain `status-todo` circle): `status-backlog`, `status-todo` (neutral), `status-in-progress` (blue), `status-in-review` (violet), `status-done` (green), all muted. Priority: `priority-low` (neutral), `priority-medium` (amber), `priority-high` (the destructive red).

The theme follows the system until the user toggles it; the choice is stored in `localStorage` (`sumi.theme`) and applied before first paint by the inline script in `index.html`.

## Rules

- **Use tokens, not raw values.** Write `bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`, `type-title`; never a hex value, a raw Tailwind palette color (`bg-black/30`, `text-red-500`) or an arbitrary type size (`text-[13px]`, `tracking-[0.06em]`). Change the look by editing `style.css`. A test enforces this ([Enforcement](#enforcement)).
- **The accent has a job.** Use `primary` only for: primary buttons, the active navigation item (`bg-primary/12` tint, key in `text-primary-ink`), focus rings and borders, selected or drop-target states (the `bg-primary/12` tint), and links (`text-primary-ink`). Not for icons, avatars, headings, badges, hover states or the logo. Hover is always neutral (`bg-accent`).
- **Text on a filled accent is dark** (`--primary-foreground`): white on the orange is only about 2.9:1, dark is 5.9:1.
- **Secondary text uses `text-muted-foreground`.** Anything smaller than 12px is only for monospace keys (`type-key`) and avatar initials (`type-initials`).
- **Status and priority are signals, not decoration:** small icons in muted colors (`StatusIcon.vue`, `PriorityIcon.vue`), never filled badges.
- **Agents vs humans:** humans are round avatars with initials, agents are square with a bot icon, both neutral.
- **One radius scale:** controls `rounded-md` (6px), cards and trays `rounded-md` / `rounded-lg` (6 / 8px), the dialog `rounded-xl` (12px). Shadows: see [Elevation](#elevation).
- **Every interactive element follows the [state model](#states).** Focus is always visible and uses the accent; hover is neutral.

## Hierarchy

Every view has one thing it is for. Rank each element as **primary** (what the view is for), **secondary** (supporting content and controls) or **tertiary** (metadata and hints), and let the styling show the rank:

| View | Primary | Secondary | Tertiary |
| --- | --- | --- | --- |
| Board | the "New ticket" button, ticket titles | column headers, project nav, header tools | keys, counts, priority, PR and branch, "No tickets" |
| Ticket detail | the title (and Save while editing) | fields, description, comments, Comment button, section labels | key, links, timestamps, activity |
| New ticket dialog | the Create ticket button | title, description and status fields | the hint under the title, field labels |
| Sign in | Continue with GitHub (the token Sign in button when GitHub is off) | the token field and its label | the hint under the title |

Rules:

- **One primary action per view.** The primary action is the one solid `Button` (the default variant). A view is a page or an open dialog; a dialog on top of the board has its own primary action. Two solid buttons at the same time means one of them is secondary: use `outline`.
- **Emphasis comes from weight and color, not from a smaller size.** Three levels, no more: primary text is `text-foreground` and `font-medium` or `font-semibold`; secondary is `text-foreground` regular; tertiary is `text-muted-foreground`. Do not shrink text to demote it, and do not use opacity to make text fainter (`text-muted-foreground/80` falls under 4.5:1). Smaller sizes belong to roles (`type-key`, `text-xs` metadata), not to a rank.
- **Action hierarchy.** Primary: solid (`default`). Secondary: `outline` where it sits next to a primary action or must be found easily (Comment, Done, Show everything), `ghost` where it should stay quiet (Cancel, toolbar and icon buttons). Tertiary: a text link (`link` variant). Destructive actions use the destructive color on a ghost or outline button (the lane trash turns red on hover) and are never the primary action of a view.
- **Icon buttons are `ghost` `Button`s** (`icon-xs` in lane headers, `icon-sm` in dialogs, `icon` in the header), including the dialog close button, so they share every state. Do not hand-roll a button's classes.

## Typography

Geist (sans) and Geist Mono, self-hosted through `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` (SIL OFL). Mono is for keys, branches and code (`font-mono`). No webfont CDN.

Base text is 14px (`text-sm`). The scale is a set of **roles**, defined in `style.css` as `type-*` utilities (size, weight, tracking, case; color is a separate decision, see hierarchy). Use a role, not loose size classes:

| Role | Class | Is |
| --- | --- | --- |
| Page, dialog or card title | `type-title` | `text-lg font-semibold tracking-tight` |
| Column header | `type-column` | 13px `font-semibold tracking-tight` |
| Ticket title on a card | `type-card-title` | 13px `font-medium leading-snug text-pretty` |
| Body, description | `text-sm` (`leading-relaxed` for long text) | 14px |
| Field values, activity and helper text | `type-field` | 13px |
| Section label | `type-label text-muted-foreground` | `text-xs font-medium uppercase tracking-label` |
| Metadata (counts, timestamps, hints) | `text-xs text-muted-foreground` | 12px |
| Mono key on a card, branch name | `type-key` | Geist Mono 11px |
| Mono key or count elsewhere (dialog header, project nav, column and menu counts) | `font-mono text-xs` | Geist Mono 12px |
| Avatar initials | `type-initials` | 9px `font-semibold` |

The 13px, 11px and 9px sizes and the label and wordmark tracking are theme tokens (`text-field`, `text-key`, `text-initials`, `tracking-label`, `tracking-wordmark`). `cn` (tailwind-merge) does not know the `type-*` roles: when a primitive in `components/ui` sets its own size or line height, drop that from the primitive (as done for `CardTitle` and `Label`) instead of expecting an override.

Use `font-semibold` for headings and `font-medium` for emphasis; avoid `font-black` except in the wordmark.

## Spacing

A 4px-based scale. Use only these steps for `gap`, `padding` and `margin`:

| px | 4 | 8 | 12 | 16 | 24 | 32 | 48 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tailwind | `1` | `2` | `3` | `4` | `6` | `8` | `12` |

Neighbouring steps differ by at least a third, so a step is always visible. Control heights (`h-6`, `h-8`, `h-9`) and icon sizes are not spacing. The page gutter is 16px, 24px from `sm`; dialog sections are 24px apart. A test flags any other `gap`, `padding`, `margin` or `space` step in `src/` outside `components/ui/`.

**Proximity:** space within a group is smaller than space between groups. Inside a card or a field row use 4 or 8; between cards, rows or fields at the same level use one step more than that; between sections (dialog sections, header vs. board) use 16 or more. If two gaps look equal but one separates groups, make the outer one bigger rather than adding a divider.

## Motion

One duration (`--default-transition-duration`, 150ms) and one ease-out curve (`--default-transition-timing-function`), applied by Tailwind's `transition-colors` and friends; do not set `duration-*` or `ease-*` on components. Motion only communicates a state change (hover, focus, a drop target, a popover or dialog opening, a spinner while loading). No bounce, no scale on hover, nothing that moves on its own.

## Elevation

Two named levels, nothing in between:

| Level | Use | Class |
| --- | --- | --- |
| 0, flat | everything: page, cards, trays, inputs, buttons, popovers (a hairline `border-border` separates them) | none |
| 1, overlay | the ticket and new-ticket dialogs, over a `bg-scrim` backdrop | `shadow-overlay` |

## States

One model for every interactive element. Use the same classes so the board feels the same everywhere.

| State | Treatment |
| --- | --- |
| Default | Semantic tokens at rest: `bg-card` / `bg-muted` surface, `border-input` control border, `text-muted-foreground` for quiet controls |
| Hover | Neutral `bg-accent` (never the brand accent, never a scale). Elements that are filled or bordered rather than ghost: `hover:border-foreground/25` for cards and fields, `hover:bg-primary/90` for the primary button. Text may step up to `text-foreground` |
| Pressed | One step deeper than hover: `active:bg-accent/70`, primary `active:bg-primary/80`. Draggable cards: `active:cursor-grabbing` |
| Focus-visible | `outline-none focus-visible:ring-2 focus-visible:ring-ring/40`, plus `focus-visible:border-ring` on anything with a border. Never removed without a replacement |
| Disabled | `disabled:pointer-events-none disabled:opacity-50`; the primary button turns neutral (`bg-muted text-muted-foreground`) instead of fading |
| Selected | Accent tint, not a fill: `bg-primary/12`, one step deeper on hover (`hover:bg-primary/16`), with the key or label in `text-primary-ink`. Checkboxes use the accent fill. The drop target (lane or tray) uses the same tint, plus `border-primary/40` on the tray |
| Error | `text-destructive`; fields `border-destructive` via `aria-invalid`; messages `bg-destructive/10 text-destructive rounded-md px-3 py-2` with `role="alert"` |
| Loading | Content stays in place: skeletons use `bg-muted` (`Skeleton`), refresh icons use `animate-spin`, buttons that wait are disabled |

## Enforcement

`packages/web/test/design-tokens.test.ts` (part of `pnpm test`):

- No arbitrary `text-[..]`, `tracking-[..]` or `leading-[..]`, no spacing off the scale, no hex or `rgb()` colors and no raw Tailwind palette colors in `src/`, except in `style.css` and `components/ui/`.
- Every token in `:root` has a counterpart in `.dark`, and the reverse (`--radius` is shared).
- The documented pairings meet WCAG contrast in both themes: text 4.5:1, icons and indicators 3:1. A short list of known gaps (light-theme focus ring, control borders, faint backlog icon) is excused in the test with a reason; the test fails once one of them is fixed, so the list cannot go stale.

## Logo

Temporary, in `AppWordmark.vue`: the Lucide `Origami` icon (stroke 2.5, text color, not the accent) and the word SUMI, uppercase, Geist Black 20px, letter spacing -7% (`tracking-wordmark`), 8px gap (`gap-2`). Replace it there when a real logo exists.

## Interaction

- The header has no divider or background of its own: it and the board are one seamless surface (`bg-background`). Keep it that way.
- Cards are draggable between columns; the target column gets an accent tint and border while a card is over it. Cards are also keyboard-focusable and open the detail panel with Enter or click.
- The ticket detail is a centered modal (nearly full width on narrow screens, scrolls when tall) with native `<select>` fields styled like inputs (custom chevron, `appearance-none`). Titles and descriptions are edited in place in an edit mode (pencil button, Save/Cancel), and tickets are created from the "New ticket" button in the header, in a modal of the same look ([ADR 0026](adr/0026-create-and-edit-tickets-in-the-web-ui.md)). Anything draggable also needs a non-drag way to do it (the status select), because touch screens cannot drag.
- **View options** is a popover on the sliders button next to the theme toggle: a "Hide empty lanes" checkbox and one checkbox per lane. The row is the whole checkbox (accent fill when checked, the same job as other selected states), counts are mono, and the button takes the `bg-primary/12` tint while a setting hides something. Settings are per browser, stored in `localStorage` (`sumi.view`), and the board shows every lane again while editing lanes ([ADR 0030](adr/0030-view-settings-stay-in-the-browser.md)).
- **Edit lanes** is a mode, switched on by the "Edit lanes" header button (which becomes "Done"). In it, lane headers show a grip, a pen (rename in place) and a trash button, can be dragged by their name (the target lane gets the accent tint), and a slim dashed "+ Add" placeholder sits at the far right ([ADR 0028](adr/0028-editable-lanes.md)). Lanes have no non-drag way to be reordered yet.

## Components

- UI primitives come from **shadcn-vue**. Add one with `pnpm dlx shadcn-vue@latest add <name>` run inside `packages/web` (it needs Node 24; Node 22.13 fails). They land in `src/components/ui/`, which is not linted. We own that code and have tuned `button`, `badge`, `input`, `card`, `skeleton` and `tooltip` for [ADR 0025](adr/0025-visual-design-language.md); re-adding one overwrites the tuning, so check `git diff` afterwards. Prefer changing tokens over editing components.
- Our own components are in `src/components/` and `src/views/`. Component names must be multi-word.
- Icons: `@lucide/vue`.
- The generated components import `cn` from the `cn` package (shadcn's replacement for `clsx` + `tailwind-merge`).

## Checking a change visually

Typecheck and unit tests do not catch layout problems. For UI changes, run the API and `pnpm --filter @sumi/web dev` with some seeded tickets, and look at the board in both themes and at a narrow (390px) width.

# 25. Visual design language: neutral surfaces, one accent, muted status colors

- Status: accepted
- Date: 2026-10-29

## Context

[ADR 0017](0017-web-stack.md) fixed a six-color palette (a khaki light, a near-black dark, a secondary and three oranges) and, with `design.md`, bold `font-black` headings. In use, the three oranges ran through the status icons, avatars, hover surfaces and priority badges, so the accent stopped meaning anything, and the khaki and heavy headings read louder than a tool you stare at all day should. The owner has since allowed the colors to be tuned as long as the result is professional.

## Decision

- **Warm neutrals for every surface** (page, card, tray, hover, border), in light and dark, defined as explicit tokens in `style.css`. The sand and ink character of the old palette stays; the green-yellow cast and the orange tints go.
- **One accent, orange, with a job:** primary buttons, the active navigation item (a tint, not a fill), focus rings and borders, selected or drop-target states (a tint), and links. Nothing decorative uses it, including the wordmark. shadcn's `--accent` token is repurposed as the neutral hover surface so that `hover:bg-accent` is never orange.
- **Accent as text** uses a deeper `--primary-ink` in the light theme (5.0:1 on the page; the base orange is only 2.8:1), and the same orange in dark. Text on a filled accent stays dark, as before.
- **Status and priority use muted semantic colors:** neutral for backlog and todo, then blue, violet and green for in progress, in review and done; priority is a three-bar icon, neutral for low, amber for medium and the destructive red for high. They are small icons, not filled badges.
- **Typography:** Geist with a calmer scale. Headings are `font-semibold` with tight tracking, ticket titles `font-medium` at 13px, metadata (keys, counts, links, timestamps) is small and `text-muted-foreground`, section labels are small uppercase. This replaces "use the top of the weight range". The wordmark keeps its Geist Black spec.
- **Fewer containers and one radius scale:** controls 6px, cards and column trays 8px, the dialog 12px. No shadows on cards, inputs or buttons; the dialog has one soft shadow. Column trays are a quiet tint and cards are separated by a hairline border alone.
- **The shadcn-vue components in `components/ui/` are tuned in place** (`button`, `badge`, `input`, `card`, `skeleton`, `tooltip`), which ADR 0017 already allows since we own the code. Re-adding one with the CLI overwrites the tuning, so check `git diff` after doing so.

## Consequences

- `design.md` is rewritten to describe this system; the old palette table and the "be bold" rule are gone.
- Text pairings (body, muted, accent-as-text, destructive, text on the accent) were checked against 4.5:1 in both themes.
- Colors are hard-coded only in `style.css`; components use semantic tokens (`text-priority-high`, `bg-status-done`, ...).
- No behavior, markup or API changes beyond a priority indicator component, a custom chevron on the detail selects (still native `<select>`s) and capitalized priority labels.

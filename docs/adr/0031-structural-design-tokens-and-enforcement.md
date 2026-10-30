# 31. Structural design tokens and enforcement

- Status: accepted
- Date: 2026-10-30

## Context

[ADR 0025](0025-visual-design-language.md) settled how Sumi looks, but only colors and radius were tokens. Type sizes, tracking, motion and elevation were written per component: `text-[13px]`, `text-[11px]`, `tracking-[0.06em]` and `text-[9px]` repeated in about 17 places, and dialogs used `bg-black/30` and `shadow-black/10`. Nothing stopped the next component from adding another variant, and [AGENTS.md rule 8](../../AGENTS.md) prefers rules that tooling can check.

This ADR adds structure around the same look. It does not change palette, fonts, accent, radius scale or logo, so it **does not supersede ADR 0025**; it extends it.

## Decision

- **Type roles** are `@utility` classes in `style.css` (`type-title`, `type-column`, `type-card-title`, `type-field`, `type-label`, `type-key`, `type-initials`), built on theme tokens for the sizes Tailwind lacks (`text-field` 13px, `text-key` 11px, `text-initials` 9px, `tracking-label`, `tracking-wordmark`). `text-xs` and `text-sm` stay as metadata and body. Roles define size, weight, tracking and case, not color.
- **Spacing** is a documented 4px scale (4, 8, 12, 16, 24, 32, 48 = Tailwind `1 2 3 4 6 8 12`) with a proximity rule. It is not a new token set, because Tailwind's spacing is already 4px-based; the same test flags any `gap`, `padding`, `margin` or `space` step off the scale.
- **Motion**: one duration (150ms) and one ease-out curve, set as Tailwind's default transition values. Motion communicates state changes only.
- **Elevation**: two levels. Flat, and `shadow-overlay` for dialogs. The scrim behind dialogs is the `--scrim` color token (30% black, 50% in dark).
- **State model** is a table in `design.md` (default, hover, pressed, focus-visible, disabled, selected, error, loading). The follow-up (SUMI-20) applied it to the components and added the hierarchy rules to `design.md`; the audit changed focus rings to one opacity, hand-rolled icon buttons to `ghost` `Button`s, and unified the selected tint at `bg-primary/12`.
- **Enforcement is a vitest test in `packages/web`**, not an ESLint rule: Tailwind classes live in `.vue` templates, in `.ts` string constants and in class bindings, and a text scan covers all three with one pattern. It fails on arbitrary `text-[..]`, `tracking-[..]`, `leading-[..]`, hex and `rgb()` colors and raw Tailwind palette colors outside `style.css` and `components/ui/`; it checks that every light token has a dark counterpart; and it computes WCAG contrast for the documented pairings (4.5:1 text, 3:1 icons).
- **Known contrast gaps are listed, not hidden.** The light focus ring (2.7:1 on the page), control border hairlines and the light backlog icon are below 3:1. They are excused in the test with a reason, and the test fails if an excused pairing starts passing so the list cannot go stale.

## Consequences

- Changing a size or tracking means editing one role; a new arbitrary value fails `pnpm test`.
- `CardTitle` and `Label` in `components/ui` lost their own `leading-none` and `text-sm`. `cn` (tailwind-merge) does not know the `type-*` roles, so it no longer drops a primitive's size and line height when a role is added; keeping them would have changed the login view. Re-adding these primitives with the shadcn CLI overwrites this, so check `git diff` ([ADR 0025](0025-visual-design-language.md) already says so for tuned primitives).
- The easing of hover transitions moves from Tailwind's standard curve to its ease-out curve, and the duration stays at 150ms. This is not visible at rest; nothing else on screen changes.
- Dark and light must be edited together in `style.css`; the test reminds you.

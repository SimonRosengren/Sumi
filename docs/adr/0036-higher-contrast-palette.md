# 36. Higher-contrast paper and ink palette

- Status: accepted
- Date: 2026-11-04
- Refines: [ADR 0025](0025-visual-design-language.md), [ADR 0031](0031-structural-design-tokens-and-enforcement.md)

## Context

Nearby surface values and half-opacity trays made the information-heavy board look washed out. Metadata, controls and workflow signals needed more definition.

## Decision

- Separate page, recessed tray and reading surface values in both themes. Trays use full-opacity `muted`, a quiet border; lane counts use neutral chips.
- Deepen light-theme text; brighten dark-theme text. Strengthen structural borders and give controls stronger boundaries.
- Keep orange's existing semantic role. Add opaque `primary-hover`, `primary-active` and neutral `accent-active` shades instead of fading fills.
- Use a deeper orange focus token in light mode and solid focus rings throughout.
- Strengthen status and priority colors at icon size. Keep icons small and unfilled.
- Match website tokens to the app. Preserve typography, flat elevation and spacing scales.

## Consequences

- Contrast tests cover interaction shades, focus rings, control borders and backlog icons without exceptions.
- Orange remains the focal point; surface separation carries the board's structure.

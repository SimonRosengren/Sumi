# 38. Official logo

- Status: accepted
- Date: 2026-11-04
- Supersedes: [ADR 0025](0025-visual-design-language.md), logo color only

## Context

The supplied SVG replaces the temporary Lucide Origami mark.

## Decision

- Keep the official mark in `assets/brand/logo.svg`, shared by app and website.
- Render it in the theme's `primary` orange using a CSS mask; keep the SUMI text in the foreground color.
- The logo is an exception to ADR 0025's restriction on decorative accent use.

## Consequences

- One source asset, no branding in `core`, no new package or dependency.
- Vite bundles the asset; Docker builds copy `assets/` alongside `packages/`.

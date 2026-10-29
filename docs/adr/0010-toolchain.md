# 10. Toolchain: Node 22, TypeScript 6, Vitest, ESLint, zod, MongoDB driver

- Status: accepted
- Date: 2026-10-29

## Context

Milestone 2 introduces the first dependencies. Vitest 5 requires Node 22.12+, and Node 20 is end-of-life. typescript-eslint does not yet support TypeScript 7.

## Decision

Require Node 22.12+. Use TypeScript 6 (pinned to ~6.0 until typescript-eslint supports 7), Vitest for tests, ESLint with typescript-eslint for linting, zod for the contract and the official mongodb driver in core. Package boundaries are enforced with no-restricted-imports in eslint.config.js.

## Consequences

Contributors need Node 22+ (.nvmrc). Moving to TypeScript 7 later is a small follow-up once typescript-eslint supports it. Boundary violations fail pnpm lint.

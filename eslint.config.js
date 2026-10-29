import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Package boundaries from docs/architecture.md, enforced.
 * Flat config replaces (not merges) a rule per file, so each package gets exactly one block.
 */
function forbid(names, message, { byPath = [] } = {}) {
  return {
    "no-restricted-imports": [
      "error",
      {
        paths: names.map((name) => ({ name, message })),
        patterns: [
          ...names.map((name) => ({ group: [`${name}/*`], message })),
          ...byPath.map((pkg) => ({
            group: [`**/packages/${pkg}/**`, `**/${pkg}/src/**`],
            message: `Import ${pkg} by package name, not by path.`,
          })),
        ],
      },
    ],
  };
}

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Clients reach everything through the HTTP API, never core or the database.
    files: ["packages/{cli,mcp,web}/**/*.{ts,vue}"],
    rules: forbid(["@sumi/core", "mongodb"], "Clients must use the HTTP API (AGENTS.md rule 1).", {
      byPath: ["core"],
    }),
  },
  {
    // contract is shared zod schemas only.
    files: ["packages/contract/**/*.ts"],
    rules: forbid(
      ["@sumi/core", "@sumi/api", "mongodb", "hono"],
      "contract holds shared zod schemas only (docs/architecture.md).",
      { byPath: ["core", "api"] },
    ),
  },
  {
    // core knows nothing about HTTP or the packages above it.
    files: ["packages/core/**/*.ts"],
    rules: forbid(
      ["@sumi/api", "@sumi/cli", "@sumi/mcp", "@sumi/web", "hono"],
      "core must not depend on api or clients (docs/architecture.md).",
      { byPath: ["api", "cli", "mcp", "web"] },
    ),
  },
);

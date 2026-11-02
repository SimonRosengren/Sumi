// The site copies the app's tokens (ADR 0035). Fails when they differ.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(path.resolve(import.meta.dirname, rel), "utf8");

function block(css: string, start: string): string {
  const i = css.indexOf(start);
  let depth = 0;
  for (let j = i; j < css.length; j++) {
    if (css[j] === "{") depth++;
    if (css[j] === "}" && --depth === 0) return css.slice(i, j + 1);
  }
  throw new Error(`no ${start} block`);
}

const app = read("../../web/src/style.css");
const site = read("../.vitepress/theme/tokens.css");

describe("site tokens match packages/web/src/style.css", () => {
  it.each([":root {", ".dark {", "@theme inline {"])("%s", (start) => {
    expect(block(site, start)).toBe(block(app, start));
  });
});

// Components use semantic tokens only (docs/design.md): no hex, color functions or raw palette colors.
const PALETTE = "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|white|black";
const RAW_COLOR = new RegExp(
  `#[0-9a-fA-F]{3,8}(?![\\w-])|\\b(?:rgba?|hsla?|oklch|oklab)\\(|(?<![\\w-])(?:bg|text|border|ring|outline|fill|stroke|from|via|to|shadow)-(?:${PALETTE})(?:-\\d{2,3})?(?![\\w-])`,
  "g",
);
const themeDir = path.resolve(import.meta.dirname, "../.vitepress/theme");
const sources = Object.fromEntries(
  readdirSync(themeDir)
    .filter((f) => /\.(vue|ts)$/.test(f))
    .map((f) => [f, readFileSync(path.join(themeDir, f), "utf8")]),
);

describe("site components use tokens, not raw colors", () => {
  it("scans the theme files", () => expect(Object.keys(sources).length).toBeGreaterThan(5));
  it.each(Object.entries(sources))("%s", (_file, source) => {
    expect(source.match(RAW_COLOR) ?? []).toEqual([]);
  });
});

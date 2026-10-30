// Enforces docs/design.md and ADR 0031: tokens only, both themes, readable pairings.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const styleCss = readFileSync(path.resolve(import.meta.dirname, "../src/style.css"), "utf8");

// ---------- no arbitrary type sizes or raw colors outside style.css and components/ui ----------

const PALETTE =
  "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|white|black";
const COLOR_UTILITIES =
  "bg|text|border(?:-[trblxyse])?|ring|ring-offset|outline|fill|stroke|from|via|to|divide|decoration|accent|caret|shadow|placeholder";

// Spacing steps in Tailwind units: 4, 8, 12, 16, 24, 32, 48px (docs/design.md).
const SPACING_STEPS = "0|1|2|3|4|6|8|12";
const SPACING_UTILITIES = "p|px|py|ps|pe|pt|pr|pb|pl|m|mx|my|ms|me|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y";

const RULES: { name: string; pattern: RegExp }[] = [
  { name: "arbitrary type size or spacing (use a type role, see style.css)", pattern: /(?<![\w-])(?:[\w-]+:)*(?:text|tracking|leading)-\[/g },
  {
    name: "spacing off the 4/8/12/16/24/32/48 scale",
    pattern: new RegExp(
      `(?<![\\w-])(?:[\\w-]+:)*-?(?:${SPACING_UTILITIES})-(?!(?:${SPACING_STEPS})(?![\\w.]))\\d+(?:\\.\\d+)?(?![\\w./-])`,
      "g",
    ),
  },
  { name: "raw hex color", pattern: /#[0-9a-fA-F]{3,8}(?![\w-])/g },
  { name: "raw color function", pattern: /\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/g },
  {
    name: "raw Tailwind palette color (use a semantic token)",
    pattern: new RegExp(`(?<![\\w-])(?:${COLOR_UTILITIES})-(?:${PALETTE})(?:-\\d{2,3})?(?![\\w-])`, "g"),
  },
];

function findViolations(source: string): string[] {
  return RULES.flatMap(({ name, pattern }) => [...source.matchAll(pattern)].map((m) => `${m[0]} (${name})`));
}

const sources = import.meta.glob(["../src/**/*.{vue,ts}", "!../src/components/ui/**"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("components use tokens, not arbitrary values", () => {
  it("scans the source files", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    expect(Object.keys(sources).some((f) => f.includes("/components/ui/"))).toBe(false);
  });

  it.each(Object.entries(sources))("%s", (_file, source) => {
    expect(findViolations(source)).toEqual([]);
  });

  it("flags what it should", () => {
    for (const bad of [
      "text-[13px]",
      "md:text-[0.8rem]",
      "tracking-[0.06em]",
      "leading-[1.2]",
      "color: #fff;",
      "fill: #1c1b19",
      "rgb(0 0 0 / 0.3)",
      "bg-black/30",
      "dark:bg-white/5",
      "text-red-500",
      "border-slate-200",
      "shadow-black/10",
      "px-5",
      "gap-0.5",
      "sm:py-1.5",
      "-m-1.5",
      "space-y-10",
      "gap-x-2.5",
    ]) {
      expect(findViolations(bad), bad).not.toEqual([]);
    }
  });

  it("allows what it should", () => {
    for (const ok of [
      "text-xs text-muted-foreground type-title tracking-tight tracking-label",
      "bg-card border-border text-primary-ink bg-primary/10 text-field",
      "<template #default>",
      "bg-status-done text-priority-high bg-scrim shadow-overlay",
      "p-4 px-2 py-1 gap-x-3 gap-y-1 mt-12 -my-1 space-y-8 pl-8 sm:px-6 m-auto mx-auto size-3.5 top-1/2 translate-x-1/2 max-w-sm w-24",
    ]) {
      expect(findViolations(ok), ok).toEqual([]);
    }
  });
});

// ---------- every light token has a dark counterpart ----------

function block(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block in style.css`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("\n}", start));
  const tokens: Record<string, string> = {};
  for (const m of body.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) tokens[m[1]!] = m[2]!.trim();
  return tokens;
}

const light = block(styleCss, ":root");
const dark = block(styleCss, ".dark");

// Same in both themes on purpose.
const THEME_INDEPENDENT = ["--radius"];

describe("themes", () => {
  it("reads both blocks", () => {
    expect(Object.keys(light).length).toBeGreaterThan(20);
    expect(Object.keys(dark).length).toBeGreaterThan(20);
  });

  it("has a dark counterpart for every light token, and the reverse", () => {
    const lightOnly = Object.keys(light).filter((k) => !(k in dark) && !THEME_INDEPENDENT.includes(k));
    const darkOnly = Object.keys(dark).filter((k) => !(k in light));
    expect({ lightOnly, darkOnly }).toEqual({ lightOnly: [], darkOnly: [] });
  });

  it("does not repeat a theme-independent token in the dark block", () => {
    expect(THEME_INDEPENDENT.filter((k) => k in dark)).toEqual([]);
  });
});

// ---------- contrast of the documented pairings (WCAG 2.x) ----------

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const themes = { light, dark };
const SURFACES = ["--background", "--card", "--popover", "--muted"];

// Text: 4.5:1. [foreground, surfaces it sits on].
const TEXT: [string, string[]][] = [
  ["--foreground", SURFACES],
  ["--muted-foreground", SURFACES],
  ["--primary-ink", SURFACES],
  ["--destructive", SURFACES],
  ["--priority-medium", SURFACES],
  ["--primary-foreground", ["--primary"]],
  ["--accent-foreground", ["--accent"]],
  ["--muted-foreground", ["--accent"]], // ghost buttons at rest sit on the surface; hover swaps text to foreground
];

// UI (icons, indicators): 3:1.
const UI: [string, string[]][] = [
  ["--status-todo", ["--card", "--muted"]],
  ["--status-in-progress", SURFACES],
  ["--status-in-review", SURFACES],
  ["--status-done", SURFACES],
  ["--priority-medium", SURFACES],
  ["--destructive", SURFACES],
];

// Known gaps, kept visible instead of hidden (ADR 0031). Remove an entry when it is fixed;
// the test below fails if an excused pairing starts to pass, so this list cannot go stale.
const EXCUSED: Record<string, string> = {
  "light --ring on --background": "focus ring uses the base orange, 2.7:1; the ring also has a border and a 30% halo",
  "light --ring on --card": "see above",
  "light --ring on --muted": "see above",
  "light --input on --card": "control borders are hairlines; the field fill and label carry the affordance",
  "dark --input on --card": "see above",
  "light --status-backlog on --card": "backlog is deliberately faint (dashed circle) and always next to its lane name",
};

const pairs = (list: [string, string[]][], min: number) =>
  Object.keys(themes).flatMap((theme) =>
    list.flatMap(([fg, bgs]) => bgs.map((bg) => ({ theme: theme as keyof typeof themes, fg, bg, min }))),
  );

describe("contrast", () => {
  it.each(pairs(TEXT, 4.5))("text $theme $fg on $bg is at least $min:1", ({ theme, fg, bg, min }) => {
    expect(contrast(themes[theme][fg]!, themes[theme][bg]!)).toBeGreaterThanOrEqual(min);
  });

  it.each(pairs(UI, 3))("ui $theme $fg on $bg is at least $min:1", ({ theme, fg, bg, min }) => {
    expect(contrast(themes[theme][fg]!, themes[theme][bg]!)).toBeGreaterThanOrEqual(min);
  });

  it.each(Object.entries(EXCUSED))("excused: %s (%s)", (key) => {
    const [theme, fg, , bg] = key.split(" ") as [keyof typeof themes, string, string, string];
    expect(contrast(themes[theme][fg]!, themes[theme][bg]!)).toBeLessThan(3);
  });
});

import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitepress";

// The site renders ../../docs (ADR 0035). SITE_BASE / SITE_URL make a custom domain a config change.
// docs/ sits outside this package, so markdown cannot resolve vue on its own.
const vueDir = path.dirname(createRequire(import.meta.url).resolve("vue/package.json"));
const docsDir = path.resolve(import.meta.dirname, "../../../docs");
const base = process.env.SITE_BASE ?? "/Sumi/";
const siteUrl = process.env.SITE_URL ?? "https://simonrosengren.github.io/Sumi/";
const repoUrl = "https://github.com/SimonRosengren/Sumi";

function titleOf(file: string): string {
  const heading = readFileSync(file, "utf8").match(/^# (.+)$/m)?.[1] ?? path.basename(file, ".md");
  return heading.replace(/^\d+\.\s+/, "");
}

function pages(dir: string, prefix: string) {
  return readdirSync(path.join(docsDir, dir))
    .filter((f) => f.endsWith(".md") && f !== "README.md" && !f.startsWith("0000-"))
    .sort()
    .map((f) => ({ text: titleOf(path.join(docsDir, dir, f)), link: `${prefix}${f.replace(/\.md$/, "")}` }));
}

export default defineConfig({
  title: "Sumi",
  description:
    "Sumi is an open-source, self-hosted alternative to Linear, Jira and Trello: a minimal Kanban ticket tracker with an MCP server and CLI for AI agents.",
  lang: "en",
  base,
  srcDir: "../../docs",
  // The docs index is README.md on GitHub; on the site it lives at /docs and / is the landing page.
  rewrites: { "README.md": "docs.md" },
  // ADR 0019 links to a file that does not exist (ADRs are append-only, so the link stays).
  ignoreDeadLinks: [/^\.\/0012-mutations-in-transactions$/],
  srcExclude: ["adr/0000-template.md"],
  cleanUrls: true,
  sitemap: { hostname: siteUrl },
  // VitePress 1.x bundles Vite 5 types; Tailwind targets newer Vite.
  vite: {
    plugins: [tailwindcss() as never],
    resolve: { alias: [{ find: /^vue(\/.*)?$/, replacement: `${vueDir}$1` }] },
  },
  markdown: {
    config(md) {
      // docs/ links to source files outside docs/ (../packages/...); point those at GitHub.
      md.core.ruler.push("sumi-repo-links", (state) => {
        const from = String(state.env?.relativePath ?? "");
        for (const block of state.tokens) {
          for (const token of block.children ?? []) {
            const href = token.type === "link_open" ? token.attrGet("href") : null;
            if (!href || /^([a-z]+:|#|\/)/i.test(href)) continue;
            const target = path.posix.normalize(path.posix.join(path.posix.dirname(from), href));
            if (target.startsWith("..")) {
              token.attrSet("href", `${repoUrl}/blob/main/${path.posix.normalize(path.posix.join("docs", target))}`);
            }
          }
        }
      });
    },
  },
  themeConfig: {
    nav: [
      { text: "Docs", link: "/docs" },
      { text: "GitHub", link: repoUrl },
    ],
    socialLinks: [{ icon: "github", link: repoUrl }],
    search: { provider: "local" },
    sidebar: [
      {
        text: "Docs",
        items: [
          { text: "Overview", link: "/docs" },
          { text: "Architecture", link: "/architecture" },
          { text: "Domain", link: "/domain" },
          { text: "Design", link: "/design" },
          { text: "Roadmap", link: "/roadmap" },
        ],
      },
      { text: "Guides", items: pages("guides", "/guides/") },
      { text: "Decisions (ADRs)", collapsed: true, items: pages("adr", "/adr/") },
    ],
  },
});

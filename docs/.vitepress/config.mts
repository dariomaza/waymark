import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, type Plugin } from "vitepress";

import { favicon, logo, themeColor, themeCss } from "./brand";
import { sourceLinks } from "./source-links";
import { DARK, LIGHT } from "../../packages/tokens/src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(HERE, "..");
const REPO_ROOT = resolve(SRC_DIR, "..");

/**
 * Every ADR, in number order, titled by its own heading — so a new decision
 * appears in the sidebar by being written, not by being listed here too.
 */
const decisions = readdirSync(join(SRC_DIR, "decisions"))
  .filter((name) => /^\d{4}-.*\.md$/.test(name))
  .sort()
  .map((name) => {
    const heading = /^# (.+)$/m.exec(readFileSync(join(SRC_DIR, "decisions", name), "utf8"));

    return { text: heading?.[1] ?? name, link: `/decisions/${name.replace(/\.md$/, "")}` };
  });

/** The theme's colours, generated from `@waymark/tokens` (see `brand.ts`). */
const BRAND_CSS = "virtual:waymark-brand.css";

const brandCss = (): Plugin => ({
  name: "waymark-brand-css",
  resolveId: (id) => (id === BRAND_CSS ? `\0${BRAND_CSS}` : undefined),
  load: (id) => (id === `\0${BRAND_CSS}` ? themeCss() : undefined),
});

export default defineConfig({
  title: "Waymark",
  description:
    "Self-hosted inventory for a home or homelab: spaces inside spaces, a QR label on every box, and search that answers where you put it.",
  lang: "en",
  // Served at https://dariomaza.github.io/waymark/.
  base: "/waymark/",
  // GitHub Pages answers `/waymark/api` with `api.html`, so the `.html` can go.
  cleanUrls: true,
  lastUpdated: false,

  // `decisions/README.md` is the index GitHub shows for the folder; here it is
  // the folder's page too.
  rewrites: { "decisions/README.md": "decisions/index.md" },

  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: favicon() }],
    ["meta", { name: "theme-color", content: themeColor.light, media: "(prefers-color-scheme: light)" }],
    ["meta", { name: "theme-color", content: themeColor.dark, media: "(prefers-color-scheme: dark)" }],
  ],

  markdown: {
    config: sourceLinks(REPO_ROOT, SRC_DIR),
  },

  vite: {
    plugins: [brandCss()],
  },

  themeConfig: {
    // The logo is the name (ADR 24), so the typed title would say it twice.
    logo: { light: logo(LIGHT), dark: logo(DARK), alt: "Waymark" },
    siteTitle: false,

    nav: [
      { text: "Product", link: "/product/search" },
      { text: "Self-hosting", link: "/self-hosting/" },
      { text: "API", link: "/api" },
      { text: "Decisions", link: "/decisions/" },
      { text: "Roadmap", link: "/roadmap" },
    ],

    sidebar: [
      {
        text: "Waymark",
        items: [
          { text: "What it is", link: "/" },
          { text: "Architecture", link: "/architecture" },
          { text: "Status", link: "/status" },
        ],
      },
      {
        text: "Product tour",
        items: [
          { text: "Search", link: "/product/search" },
          { text: "QR codes and labels", link: "/product/labels" },
          { text: "Photos", link: "/product/photos" },
          { text: "Accounts and sharing", link: "/product/accounts" },
          { text: "Web client", link: "/product/web-client" },
          { text: "Android app", link: "/android" },
          { text: "MCP server", link: "/mcp" },
        ],
      },
      {
        text: "Self-hosting",
        items: [
          { text: "Deployment", link: "/self-hosting/" },
          { text: "Background removal", link: "/self-hosting/background-removal" },
        ],
      },
      {
        text: "Reference",
        items: [{ text: "HTTP API", link: "/api" }],
      },
      {
        text: "Development",
        items: [
          { text: "Overview", link: "/development/" },
          { text: "Continuous integration", link: "/development/ci" },
          { text: "Releasing", link: "/development/releasing" },
          { text: "Roadmap", link: "/roadmap" },
        ],
      },
      {
        text: "Decisions",
        collapsed: true,
        items: [{ text: "Index", link: "/decisions/" }, ...decisions],
      },
    ],

    search: { provider: "local" },

    socialLinks: [{ icon: "github", link: "https://github.com/dariomaza/waymark" }],

    editLink: {
      pattern: "https://github.com/dariomaza/waymark/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
  },
});

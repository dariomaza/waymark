import { dirname, posix, relative, resolve } from "node:path";

import type { MarkdownRenderer } from "vitepress";

/**
 * # Links that leave the site point at the repository
 *
 * The Markdown in `docs/` is read in two places: on GitHub, where a relative
 * link to `../../apps/api/src/app.ts` opens the file, and on this site, where
 * the same link would be a 404. So the files keep their relative links — they
 * still read correctly on GitHub — and this rewrites them while the site is
 * built:
 *
 * - a link that resolves OUTSIDE `docs/`, or to a file in it that is not a
 *   page, becomes `https://github.com/dariomaza/waymark/blob/main/<path>`
 *   (`tree/main` for a directory);
 * - a link to a `README.md` inside `docs/` becomes its directory, because the
 *   site serves that README as the directory's index.
 *
 * Everything else is left to VitePress, whose dead-link check then still sees
 * every link between pages.
 */
const REPOSITORY = "https://github.com/dariomaza/waymark";

const isRelative = (href: string): boolean =>
  href !== "" && !href.startsWith("#") && !href.startsWith("/") && !/^[a-z][a-z0-9+.-]*:/i.test(href);

export const sourceLinks =
  (repoRoot: string, srcDir: string) =>
  (md: MarkdownRenderer): void => {
    md.core.ruler.push("waymark-source-links", (state) => {
      const file: unknown = state.env?.path;

      if (typeof file !== "string") return;

      const rewrite = (href: string): string => {
        if (!isRelative(href)) return href;

        const [target = "", hash] = href.split("#", 2);
        const absolute = resolve(dirname(file), decodeURI(target));
        const fromRoot = relative(repoRoot, absolute).split("\\").join("/");
        const fromDocs = relative(srcDir, absolute).split("\\").join("/");
        const insideDocs = !fromDocs.startsWith("..");
        const fragment = hash === undefined ? "" : `#${hash}`;

        if (insideDocs) {
          if (posix.basename(fromDocs) === "README.md") {
            return `${href.slice(0, href.length - fragment.length - "README.md".length) || "./"}${fragment}`;
          }

          if (target === "" || target.endsWith("/") || target.endsWith(".md")) return href;
        }

        const isDirectory = target.endsWith("/") || posix.extname(fromRoot) === "";

        return `${REPOSITORY}/${isDirectory ? "tree" : "blob"}/main/${fromRoot}${fragment}`;
      };

      const visit = (tokens: typeof state.tokens): void => {
        for (const token of tokens) {
          if (token.type === "link_open") {
            const href = token.attrGet("href");

            if (href !== null) token.attrSet("href", rewrite(href));
          }

          if (token.children) visit(token.children);
        }
      };

      visit(state.tokens);
    });
  };

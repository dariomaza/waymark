import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * # Every heading on this client is the size the phone client draws it
 *
 * `tokens.css` defines a type scale — 14, 16, 20, 24 — and `tokens.ts` on the
 * phone carries the same four numbers. The phone USES them: every `<Text>`
 * that is a title names one. This client, for a long time, did not. `base.css`
 * gave `h1, h2, h3` a line height and a margin and said nothing about size, so
 * every bare heading fell through to whatever the browser had decided a
 * heading was — 32, 24 and 18.72 pixels, three numbers from a 1996 stylesheet,
 * none of them on the scale this product defines.
 *
 * The screen title matched at 24 by coincidence and the section heading missed
 * by 1.28 pixels, which is exactly the kind of difference nobody can name and
 * everybody can see: the two clients sat side by side on one phone and read as
 * two products.
 *
 * The phone is the reference, because the phone is the one that was already
 * deliberate.
 *
 * ## Why this asks the cascade rather than reading the file
 *
 * A test that greps `base.css` for `font-size` passes just as happily for a
 * rule inside a media query that never matches, for one a later selector
 * overrides, and for one that names a token that does not exist. So the
 * stylesheets go into a document and the question — how big is this heading —
 * is put to the DOM.
 *
 * jsdom does not resolve `var()`, so it answers `var(--text-l)` rather than
 * `20px`. That is not a limitation here, it is the better answer: it proves
 * the heading was given a TOKEN and not a hardcoded pixel, and the token is
 * then resolved against `tokens.css` itself, so a scale that moves moves this
 * test with it.
 */

const STYLES = join(process.cwd(), "src/ui/styles");
const SRC = join(process.cwd(), "src");

const TOKENS = readFileSync(join(STYLES, "tokens.css"), "utf8");
const BASE = readFileSync(join(STYLES, "base.css"), "utf8");

/**
 * The scale, read out of the file that defines it: `--text-s` and its three
 * siblings, in pixels. A rem is the root font size, and nothing in this app
 * moves that, so a rem is 16 of them.
 */
const SCALE = new Map<string, number>(
  [...TOKENS.matchAll(/(--text-[a-z]+):\s*([\d.]+)rem/gu)].map(([, name, rem]) => [
    `var(${String(name)})`,
    Number(rem) * 16,
  ]),
);

/**
 * What a person actually sees, in pixels — or, when the answer is not on the
 * scale, the raw value, so that a failure names the browser default it fell
 * through to instead of saying `null`.
 */
const sizeOf = (markup: string, sheets: readonly string[] = []): string => {
  document.head.innerHTML = `<style>${TOKENS}${BASE}${sheets.join("")}</style>`;
  document.body.innerHTML = markup;

  const heading = document.querySelector("h1, h2, h3, h4, h5, h6");
  if (heading === null) {
    throw new Error("that markup has no heading in it");
  }

  const drawn = globalThis.getComputedStyle(heading).fontSize;
  const onScale = SCALE.get(drawn);

  return onScale === undefined ? drawn : `${String(onScale)}px`;
};

describe("the type scale this app publishes", () => {
  it("is four sizes, and they are the four the phone client carries", () => {
    expect([...SCALE.values()].sort((a, b) => a - b)).toEqual([14, 16, 20, 24]);
  });

  /**
   * The control. If this harness did not apply a browser's own heading size in
   * the first place, every assertion below would be green whatever `base.css`
   * said — which is precisely how the bug survived: nothing was measuring.
   */
  it("is not what a browser reaches for on its own, which is why this test exists", () => {
    document.head.innerHTML = "";
    document.body.innerHTML = "<h3>Photos</h3>";

    expect(globalThis.getComputedStyle(document.querySelector("h3")!).fontSize).not.toBe("20px");
  });
});

/**
 * Role by role, against the phone. Each number below is read off
 * `apps/mobile/src/ui/styles/tokens.ts` through the component that uses it, so
 * the two clients are asserted to agree rather than asserted separately.
 */
describe("a heading is the size the phone draws the same heading", () => {
  it("makes the screen's own name 24, which is `ScreenTitle`", () => {
    expect(sizeOf("<h2>Search</h2>")).toBe("24px");
  });

  it("makes the sign-in title 24 too, since the phone titles it with `ScreenTitle`", () => {
    expect(sizeOf("<h1>Waymark</h1>")).toBe("24px");
  });

  it("makes a section inside a screen 20, which is the phone's section heading", () => {
    expect(sizeOf("<h3>Photos</h3>")).toBe("20px");
  });

  it("makes a panel's heading 20, which is the phone's machine-tokens panel", () => {
    expect(sizeOf("<h4>Machine tokens</h4>")).toBe("20px");
  });

  it("makes the sheet's title 20, which is the phone's `Sheet`", () => {
    const sheet = readFileSync(join(SRC, "ui/organisms/sheet.css"), "utf8");

    expect(
      sizeOf(`<div class="sheet"><div class="sheet__head"><h3>Edit item</h3></div></div>`, [sheet]),
    ).toBe("20px");
  });

  /**
   * The one heading that is deliberately NOT the screen title's size. The top
   * bar says which product you are in, and the phone's `AppBar` sets it to
   * `text.l` for the same reason: it is furniture above the screen, not the
   * name of what is on it.
   */
  it("keeps the top bar at 20, which is what the phone's `AppBar` uses", () => {
    const bar = readFileSync(join(SRC, "ui/organisms/app-bar.css"), "utf8");

    expect(sizeOf(`<header class="app-bar"><h1 class="app-bar__title">Waymark</h1></header>`, [bar]))
      .toBe("20px");
  });
});

/**
 * # The guard, so that the next heading is caught on the day it is written
 *
 * The six assertions above name the roles that exist today. This one names the
 * rule: every heading LEVEL this app puts on a screen has a size on the scale.
 * An `<h5>` added next year falls through to the browser's 0.83em and fails
 * here, rather than being noticed on a phone eighteen months later.
 */
describe("every heading level this app actually uses", () => {
  const componentsOf = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        return entry.name === "testing" ? [] : componentsOf(path);
      }

      return entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx") ? [path] : [];
    });

  const levels = new Map<string, string>();
  for (const path of componentsOf(SRC)) {
    for (const [, level] of readFileSync(path, "utf8").matchAll(/<(h[1-6])[\s>]/gu)) {
      levels.set(String(level), relative(SRC, path));
    }
  }

  it("is more than one level, or this guard is measuring nothing", () => {
    expect(levels.size).toBeGreaterThan(2);
  });

  it.each([...levels].map(([level, where]) => [level, where]))(
    "puts %s on the scale, and %s is where one is written",
    (level) => {
      const drawn = sizeOf(`<${level}>A heading</${level}>`);

      expect([...SCALE.values()].map((size) => `${String(size)}px`)).toContain(drawn);
    },
  );
});

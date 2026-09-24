import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * # Asking the cascade what a person actually sees
 *
 * The convergence work in ADR 22 is almost entirely about appearance, and
 * appearance is the thing this codebase had no way to assert. A test that
 * greps a stylesheet for `background` passes just as happily for a rule inside
 * a media query that never matches, for one a later selector overrides, and
 * for one naming a token that does not exist.
 *
 * So the stylesheets go into a document and the question is put to the DOM,
 * which is the method `the-headings-are-on-the-scale.test.ts` established.
 *
 * ## What jsdom can and cannot answer, stated once
 *
 * This matters more than it looks, because getting it wrong produces a test
 * that is green whatever the file says.
 *
 * - A LONGHAND containing a `var()` comes back verbatim: `var(--color-line)`.
 *   Absence comes back as the property's initial value. Those are different
 *   strings, so presence and absence can be told apart.
 * - A SHORTHAND containing a `var()` comes back as `""` — and so does the
 *   same shorthand when it is absent, and so does every longhand under it.
 *   `border: 1px solid var(--color-line)` is indistinguishable from no border
 *   at all.
 *
 * That is why `declarationsIn` exists. Where a shorthand is the only honest
 * way to ask, the question goes to the file instead, and the caller says so.
 */
const STYLES = join(process.cwd(), "src/ui/styles");

export const TOKENS = readFileSync(join(STYLES, "tokens.css"), "utf8");

export const sheet = (path: string): string =>
  readFileSync(join(process.cwd(), "src", path), "utf8");

/**
 * `var(--text-s)` -> `0.875rem`, read off the generated stylesheet.
 *
 * Resolving through the file rather than hardcoding pixels is the stronger
 * assertion: it proves the rule was given a TOKEN, and the token is then read
 * from the one source both clients are built from. A scale that moves moves
 * these tests with it.
 */
const VALUES = new Map<string, string>(
  [...TOKENS.slice(0, TOKENS.indexOf("@media")).matchAll(/(--[a-z\d-]+):\s*([^;]+);/gu)].map(
    ([, name, value]) => [`var(${String(name)})`, String(value)],
  ),
);

/** What a person sees, in pixels. A rem is 16; nothing in this app moves the root. */
export const pixels = (value: string): number => {
  const resolved = VALUES.get(value) ?? value;

  return resolved.endsWith("rem") ? Number.parseFloat(resolved) * 16 : Number.parseFloat(resolved);
};

export interface DrawnOptions {
  /** The component stylesheets, in cascade order, after the tokens. */
  readonly sheets: readonly string[];
}

/** The computed style of the first `selector` in `markup`, with `sheets` applied. */
export const drawn = (
  markup: string,
  selector: string,
  { sheets }: DrawnOptions,
): CSSStyleDeclaration => {
  document.head.innerHTML = `<style>${TOKENS}${sheets.join("")}</style>`;
  document.body.innerHTML = markup;

  const element = document.querySelector(selector);
  if (element === null) {
    throw new Error(`no ${selector} in that markup`);
  }

  return globalThis.getComputedStyle(element);
};

/**
 * The declarations of one rule, as written.
 *
 * For the one question the DOM cannot answer — see above — and only for that.
 * Callers assert the block is non-empty first, so a renamed selector fails
 * loudly instead of passing by finding nothing.
 */
export const declarationsIn = (css: string, selector: string): string => {
  const literal = selector.replaceAll(/[$()*+.?[\\\]^{|}]/gu, (char) => `\\${char}`);
  const found = new RegExp(`${literal}\\s*\\{([^}]*)\\}`, "u").exec(css);
  if (found === null) {
    throw new Error(`no ${selector} rule in that stylesheet`);
  }

  return String(found[1]);
};

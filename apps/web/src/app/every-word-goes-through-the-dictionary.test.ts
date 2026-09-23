import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * # Nothing proves a visible sentence went through the dictionary
 *
 * `packages/i18n` has a parity test, and it is a good one: it proves the two
 * dictionaries agree on keys, shapes and placeholders. What it cannot prove is
 * that a screen ASKED the dictionary at all. A component that renders the
 * bare words `Signed in as` compiles, typechecks, passes every parity test,
 * and is read in English by somebody who chose Spanish — and the only way
 * anybody finds out is by looking at the screen in the other language.
 *
 * So the gap is not between the two dictionaries. It is between the dictionary
 * and the components, and this is the test that stands in it.
 *
 * ## The two shapes a hardcoded string actually takes
 *
 * 1. **JSX text**: `<p>Signed in as</p>`. Anything between two tags that
 *    contains a letter is a sentence somebody will read.
 * 2. **A literal drawn between two tags through braces**: `{count === 1 ?
 *    `1 photo` : `${count} photos`}`. JSX text is not the only way a sentence
 *    reaches the screen — a ternary does it just as well.
 * 3. **A string literal reaching a prop that gets drawn or read aloud**:
 *    `label="Password"`, `alt="A drill"`, `aria-label="Close"`,
 *    `hint="Anything can go inside anything"`. The prop names are listed
 *    below rather than inferred, because only this app knows which of its own
 *    props end up in front of a person.
 *
 * Both are checked with the TypeScript compiler's own parser rather than with
 * a regular expression. A regex cannot tell `{t("login.title")}` from the text
 * around it, cannot see an attribute that wrapped onto three lines, and reads
 * the inside of a comment as though it were code — so it would report the
 * wrong things and miss the right ones.
 *
 * ## What this deliberately does NOT catch
 *
 * A literal handed to a prop whose name is not in the list below, and a
 * sentence assembled at runtime out of pieces. Neither is a reason to skip
 * the two shapes that do get caught: six hardcoded strings were found in the
 * phone client by exactly this pair of rules.
 */

/**
 * Props whose value a person reads or hears.
 *
 * The app's own (`label`, `hint`, `error`, `explains`, `meta`, `secondary`,
 * `title`) and the platform's (`alt`, `placeholder`, and the ARIA attributes
 * that carry text rather than an id). `aria-labelledby` and `aria-describedby`
 * are deliberately absent: they carry element ids, which are machinery.
 */
const DRAWN_OR_SPOKEN = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
  "caption",
  "error",
  "explains",
  "heading",
  "hint",
  "label",
  "legend",
  "meta",
  "placeholder",
  "secondary",
  "summary",
  "title",
]);

/**
 * The words that are the same in every language.
 *
 * Only the product's own name, and `en.ts` is where that is written down:
 * "Waymark is called Waymark in both languages". A name is not a word to be
 * translated. Anything else added here needs the same kind of reason.
 */
const THE_SAME_IN_EVERY_LANGUAGE = new Set(["Waymark"]);

export interface Untranslated {
  readonly file: string;
  readonly line: number;
  /** `JSX text` or the name of the prop it was handed to. */
  readonly where: string;
  readonly text: string;
}

const saysSomething = (text: string): boolean =>
  /\p{L}/u.test(text) && !THE_SAME_IN_EVERY_LANGUAGE.has(text.trim());

/**
 * Every literal that ends up in front of a person, from one expression.
 *
 * "Ends up in front of a person" is the whole subtlety. `{t("photos.cover")}`
 * contains a string literal too, and that literal is a KEY — the one thing in
 * this app that must stay in English. So the walk follows only the positions
 * whose value is the value of the expression: the branches of a ternary, the
 * sides of `&&`, `||`, `??` and `+`, and the inside of a parenthesis. It stops
 * dead at a call, which is exactly where a key lives.
 */
const renderedLiterals = (node: ts.Node | undefined, found: string[]): void => {
  if (node === undefined) {
    return;
  }

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    found.push(node.text);

    return;
  }

  // A template with holes in it is still prose around the holes.
  if (ts.isTemplateExpression(node)) {
    found.push(node.head.text + node.templateSpans.map((span) => span.literal.text).join(""));

    return;
  }

  if (ts.isJsxExpression(node) || ts.isParenthesizedExpression(node)) {
    renderedLiterals(node.expression, found);

    return;
  }

  if (ts.isConditionalExpression(node)) {
    renderedLiterals(node.whenTrue, found);
    renderedLiterals(node.whenFalse, found);

    return;
  }

  if (ts.isBinaryExpression(node)) {
    const joins =
      node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      node.operatorToken.kind === ts.SyntaxKind.PlusToken;

    if (joins) {
      renderedLiterals(node.left, found);
      renderedLiterals(node.right, found);
    }
  }
};

/** An expression between two tags is drawn; one inside an attribute is not. */
const isJsxChild = (node: ts.JsxExpression): boolean =>
  node.parent !== undefined &&
  (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent));

export const untranslatedStringsIn = (fileName: string, source: string): Untranslated[] => {
  const parsed = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.ESNext,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  );

  const found: Untranslated[] = [];

  const report = (node: ts.Node, where: string, text: string): void => {
    found.push({
      file: fileName,
      line: parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1,
      where,
      text: text.trim(),
    });
  };

  const reportEach = (node: ts.Node, where: string, texts: readonly string[]): void => {
    for (const text of texts) {
      if (saysSomething(text)) {
        report(node, where, text);
      }
    }
  };

  const walk = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      reportEach(node, "JSX text", [node.text]);
    } else if (ts.isJsxExpression(node) && isJsxChild(node)) {
      const found: string[] = [];
      renderedLiterals(node.expression, found);
      reportEach(node, "drawn expression", found);
    } else if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(parsed);
      if (DRAWN_OR_SPOKEN.has(name)) {
        const found: string[] = [];
        renderedLiterals(node.initializer, found);
        reportEach(node, name, found);
      }
    } else if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
      // `options={[{ value: "", label: "Choose a unit…" }]}` — the same prop,
      // one object further in.
      const name = node.name.text;
      if (DRAWN_OR_SPOKEN.has(name)) {
        const found: string[] = [];
        renderedLiterals(node.initializer, found);
        reportEach(node, name, found);
      }
    }

    ts.forEachChild(node, walk);
  };

  walk(parsed);

  return found;
};

/**
 * `process.cwd()`, not `import.meta.url`: this file is compiled by Vite before
 * it runs, and the module URL it is handed by then is not a `file:` one. The
 * working directory is the package root, which is where `vitest.config.ts`
 * already resolves `src/**` from.
 */
const SRC = join(process.cwd(), "src");

/**
 * Every file a person can see the output of.
 *
 * Tests are left out because a test asserting `getByRole("button", { name:
 * "Sign out" })` is naming what it expects to read, which is the opposite of
 * the problem. `src/testing/` is left out for the same reason.
 */
const componentsOf = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return entry.name === "testing" ? [] : componentsOf(path);
    }

    const drawn = entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx");

    return drawn ? [path] : [];
  });

const COMPONENTS = componentsOf(SRC);

describe("every word on screen", () => {
  it("is looked at by this test at all, which is the first thing to prove", () => {
    expect(COMPONENTS.length).toBeGreaterThan(20);
  });

  it.each(COMPONENTS.map((path) => [relative(SRC, path), path]))(
    "goes through the dictionary in %s",
    (_name, path) => {
      const found = untranslatedStringsIn(path, readFileSync(path, "utf8"));

      expect(
        found.map((one) => `line ${String(one.line)} (${one.where}): ${one.text}`),
      ).toEqual([]);
    },
  );
});

/**
 * A guard that catches nothing passes forever. These are the shapes it exists
 * for, written out, so that a change which quietly stops it seeing them fails
 * here rather than in a language nobody on the team reads.
 */
describe("the guard itself", () => {
  const scan = (source: string): string[] =>
    untranslatedStringsIn("sample.tsx", source).map((one) => one.text);

  it("catches a sentence written between two tags", () => {
    expect(scan("const A = () => <p>Signed in as dario</p>;")).toEqual(["Signed in as dario"]);
  });

  it("catches a sentence handed to a prop that is drawn", () => {
    expect(scan('const A = () => <Field label="Password" />;')).toEqual(["Password"]);
  });

  it("catches one wearing braces, and one wearing backticks", () => {
    expect(scan('const A = () => <Field hint={"Optional."} />;')).toEqual(["Optional."]);
    expect(scan("const A = () => <Field hint={`Optional.`} />;")).toEqual(["Optional."]);
  });

  it("catches one inside an options array, where a prop hides in an object", () => {
    expect(scan('const A = () => <Select options={[{ value: "", label: "Choose…" }]} />;')).toEqual(
      ["Choose…"],
    );
  });

  it("catches a sentence a ternary draws between two tags", () => {
    expect(
      scan("const A = () => <p>{n === 1 ? `1 photo is queued.` : `${n} photos are queued.`}</p>;"),
    ).toEqual(["1 photo is queued.", "photos are queued."]);
  });

  it("leaves a message KEY alone, which is the one string that must stay English", () => {
    expect(scan('const A = () => <p>{t("photos.cover")}</p>;')).toEqual([]);
    expect(scan('const A = () => <p>{busy ? t("a.b") : t("c.d")}</p>;')).toEqual([]);
  });

  it("leaves a translated prop alone", () => {
    expect(scan('const A = () => <Field label={t("login.password")} />;')).toEqual([]);
  });

  it("leaves the machinery alone: ids, classes, types and routes are not copy", () => {
    expect(
      scan(
        'const A = () => <input id="password" name="password" type="password" className="field__input" autoComplete="current-password" />;',
      ),
    ).toEqual([]);
  });

  it("leaves a comment alone, which is the whole reason this is a parser", () => {
    expect(scan('const A = () => <p>{/* label="Password" */}{t("x")}</p>;')).toEqual([]);
  });

  it("leaves punctuation and numbers alone: ×8 is not a sentence", () => {
    expect(scan("const A = () => <span>×{quantity}</span>;")).toEqual([]);
  });

  it("leaves the product's own name alone, because it is the same in both languages", () => {
    expect(scan('const A = () => <AppBar title="Waymark" />;')).toEqual([]);
  });
});

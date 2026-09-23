import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import * as ts from "typescript";

/**
 * # The gap the parity test cannot see
 *
 * `@waymark/i18n` proves the two dictionaries agree: same keys, same holes in
 * the same sentences. What no test in that package can prove is that a screen
 * ever ASKED. A component with `<Text>Quantity {n}</Text>` in it passes the
 * parity test, passes the type checker, passes every behaviour test written in
 * English — and is simply English on a Spanish phone.
 *
 * That is the whole failure mode: the translation layer is not bypassed loudly,
 * it is bypassed by not being used, and nothing about not using something
 * shows up in a test of the thing itself.
 *
 * So this reads the source. Every file the app ships is parsed with the
 * TypeScript compiler — the one already installed to typecheck it, so this
 * costs no dependency — and two shapes are refused:
 *
 * - JSX TEXT. Anything between `<Text>` and `</Text>` that contains a letter is
 *   a sentence somebody wrote in English rather than a key somebody looked up.
 * - A string LITERAL in a prop that ends up spoken or drawn: `label`, `title`,
 *   `hint`, `placeholder`, `accessibilityLabel` and the rest of the list below.
 *   An accessible name is read aloud, so an English one on a Spanish phone is
 *   the same bug with a smaller audience.
 *
 * Both are found by their shape rather than by their words, which is what makes
 * this a guard and not a list: a sentence added next year is caught on the day
 * it is written, by a test nobody has to remember to update.
 *
 * ## What it deliberately cannot catch
 *
 * A string built in a variable and handed to a prop, and any sentence composed
 * outside JSX. Those exist and are rarer, and a guard that tried to follow
 * values around would be a type checker. This catches the shape that is
 * actually easy to write by accident, which is the one worth catching.
 */

/**
 * Props whose value a person reads or hears.
 *
 * `label`, `title` and `hint` are this app's own; `accessibilityLabel` and its
 * relatives are React Native's. `children` is here for the spelling
 * `<Foo children="..." />`, which is the same sentence written sideways.
 *
 * `CopyableValue` names four things — what the string IS, what the control
 * does, what it is called once it has worked, and what it says when the phone
 * refuses — and every one of them is read or heard.
 */
const SPOKEN_PROPS = new Set([
  "accessibilityHint",
  "accessibilityLabel",
  "alt",
  "children",
  "copiedLabel",
  "copyLabel",
  "explains",
  "failedLabel",
  "hint",
  "label",
  "placeholder",
  "tabBarAccessibilityLabel",
  "title",
  "valueLabel",
]);

/**
 * The product is called Waymark in both languages, which the English
 * dictionary says in as many words. A name is not a word to be translated, so
 * the one literal that is only ever the product's own name is allowed through
 * — by being exactly that name, not by being in a file that gets a pass.
 */
const PRODUCT_NAME = "Waymark";

const COMPARISONS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
]);

/** Anything with a letter in it is something somebody wrote to be read. */
const hasWords = (value: string): boolean => /\p{L}/u.test(value);

const sourceFilesUnder = (directory: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      // `testing/` stands up fixtures for the tests themselves. Nothing in it
      // is ever drawn on a phone.
      return entry.name === "testing" ? [] : sourceFilesUnder(path);
    }

    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });

interface EnglishOnly {
  readonly where: string;
  readonly said: string;
}

/**
 * The string literals inside a prop's value that are SENTENCES.
 *
 * A prop is written three ways — `label="Close"`, `label={"Close"}` and
 * `label={busy ? "Saving" : "Save"}` — and the third one is the one a rule
 * written against the first two would let through, so this descends.
 *
 * What it does not descend into is the arguments of a call. `t("login.submit")`
 * is a literal in a `label`, and it is the OPPOSITE of the bug: it is the
 * lookup. A key, a query name and a colour are all arguments; a sentence
 * written to be read is not passed to anything, it IS the value. So a literal
 * that is an argument is a name, and a literal that stands on its own is a
 * sentence.
 */
const literalsIn = (node: ts.Node): readonly ts.StringLiteralLike[] => {
  if (ts.isStringLiteralLike(node)) {
    return [node];
  }

  if (ts.isCallExpression(node)) {
    return literalsIn(node.expression);
  }

  // `typeof children === "string"` is a question about a value, not a word for
  // anybody. A literal being COMPARED is never a sentence.
  if (ts.isBinaryExpression(node) && COMPARISONS.has(node.operatorToken.kind)) {
    return [];
  }

  const found: ts.StringLiteralLike[] = [];
  ts.forEachChild(node, (child) => {
    found.push(...literalsIn(child));
  });

  return found;
};

const englishOnlyIn = (path: string, root: string): readonly EnglishOnly[] => {
  const text = readFileSync(path, "utf8");
  const source = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const found: EnglishOnly[] = [];

  const note = (node: ts.Node, said: string): void => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    found.push({ where: `${relative(root, path)}:${String(line + 1)}`, said });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node) && hasWords(node.text)) {
      note(node, node.text.trim().replace(/\s+/gu, " "));
    }

    if (
      ts.isJsxAttribute(node) &&
      node.initializer !== undefined &&
      SPOKEN_PROPS.has(node.name.getText(source))
    ) {
      for (const literal of literalsIn(node.initializer)) {
        if (hasWords(literal.text) && literal.text !== PRODUCT_NAME) {
          note(node, `${node.name.getText(source)}="${literal.text}"`);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return found;
};

describe("every word a person reads", () => {
  const root = join(__dirname, "..");
  const files = sourceFilesUnder(root);

  it("is read from a file this app parses, or this test proves nothing", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  /**
   * One assertion over the whole app rather than one per file, because the
   * useful failure message is the LIST: every place a sentence escaped, with
   * the sentence, so the fix is one pass rather than one run of the suite per
   * violation.
   */
  it("goes through the dictionary rather than being written in the component", () => {
    const escaped = files.flatMap((path) => englishOnlyIn(path, root));

    expect(escaped).toEqual([]);
  });
});

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
 * costs no dependency — and three shapes are refused:
 *
 * - JSX TEXT. Anything between `<Text>` and `</Text>` that contains a letter is
 *   a sentence somebody wrote in English rather than a key somebody looked up.
 * - A literal DRAWN BETWEEN TWO TAGS THROUGH BRACES. `{`No unit carries the
 *   code ${code}.`}` is a sentence on the screen exactly as surely as the same
 *   words without the braces.
 * - A string LITERAL in a prop that ends up spoken or drawn: `label`, `title`,
 *   `hint`, `submitLabel`, `accessibilityLabel` and the rest of the list below.
 *   An accessible name is read aloud, so an English one on a Spanish phone is
 *   the same bug with a smaller audience.
 *
 * All three are found by their shape rather than by their words, which is what
 * makes this a guard and not a list: a sentence added next year is caught on
 * the day it is written, by a test nobody has to remember to update.
 *
 * ## Why this file and the web client's read almost identically
 *
 * They are the same guard, and for a long time they only believed they were.
 * This one inspected `ts.isJsxText` and a list of props and nothing else, so a
 * template expression handed to a `<Text>` walked straight past it — which is
 * exactly how a hardcoded English paragraph sat on the app's FIRST TAB while
 * the key that says the same thing in two languages sat unused in the
 * dictionary. The same hole was found once before, in `unit-photo.tsx`, noted,
 * and not closed.
 *
 * So the detection is now the same walk in both clients, down to the names:
 * `renderedLiterals`, `OUR_OWN_PROPS`, `THE_PLATFORM_ASKS_FOR`. The only thing
 * that legitimately differs is the platform's own vocabulary — React Native's
 * `accessibilityLabel` here, the DOM's `aria-label` there. Anything else
 * appearing in one list and not the other is drift, and the list of this app's
 * OWN props is asserted below so that dropping one is a failure rather than a
 * silence.
 *
 * ## What it deliberately cannot catch
 *
 * A sentence assembled in a variable and handed to a prop, and any prose built
 * outside JSX. Those exist and are rarer, and a guard that tried to follow
 * values around would be a type checker. This catches the shapes that are
 * actually easy to write by accident, which are the ones worth catching.
 */

/**
 * The props this app's OWN components draw or speak.
 *
 * This list is identical in `apps/web`'s guard on purpose: these are names
 * this product invented, so a prop that is copy on one client is copy on the
 * other. `children` is here for the spelling `<Foo children="..." />`, which
 * is the same sentence written sideways.
 *
 * `submitLabel` is the word on the button that ends a form, and it was missing
 * from the web client's list for as long as that list existed — which is how
 * three dialogs came to say "Save" and "Add" in Spanish.
 *
 * `CopyableValue` names four things — what the string IS, what the control
 * does, what it is called once it has worked, and what it says when the phone
 * refuses — and every one of them is read or heard.
 */
export const OUR_OWN_PROPS = [
  "caption",
  "children",
  "copiedLabel",
  "copyLabel",
  "error",
  "explains",
  "failedLabel",
  "heading",
  "hint",
  "label",
  "legend",
  "meta",
  "placeholder",
  "secondary",
  "submitLabel",
  "summary",
  "title",
  "valueLabel",
] as const;

/**
 * What the platform itself calls a name. React Native's, and the ARIA
 * spellings it also accepts. `aria-labelledby` and its relatives are
 * deliberately absent: they carry element ids, which are machinery.
 */
const THE_PLATFORM_ASKS_FOR = [
  "accessibilityHint",
  "accessibilityLabel",
  "alt",
  "aria-label",
  "aria-placeholder",
  "aria-valuetext",
  "tabBarAccessibilityLabel",
] as const;

const DRAWN_OR_SPOKEN = new Set<string>([...OUR_OWN_PROPS, ...THE_PLATFORM_ASKS_FOR]);

/**
 * The product is called Waymark in both languages, which the English
 * dictionary says in as many words. A name is not a word to be translated, so
 * the one literal that is only ever the product's own name is allowed through
 * — by being exactly that name, not by being in a file that gets a pass.
 */
const THE_SAME_IN_EVERY_LANGUAGE = new Set(["Waymark"]);

/** Anything with a letter in it is something somebody wrote to be read. */
const saysSomething = (value: string): boolean =>
  /\p{L}/u.test(value) && !THE_SAME_IN_EVERY_LANGUAGE.has(value.trim());

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
 * Every literal that ends up in front of a person, from one expression.
 *
 * "Ends up in front of a person" is the whole subtlety. `t("photos.cover")`
 * contains a string literal too, and that literal is a KEY — the one thing in
 * this app that must stay in English. So the walk follows only the positions
 * whose value is the value of the expression: the branches of a ternary, the
 * sides of `&&`, `||`, `??` and `+`, and the inside of a parenthesis. It stops
 * dead at a call, which is exactly where a key lives.
 *
 * Stopping at a call is also what keeps it out of nested JSX. A ternary whose
 * branches are elements — `{ok ? <Icon name="check" /> : null}` — would
 * otherwise hand back `"check"`, which is an icon's name and nobody's word.
 */
const renderedLiterals = (node: ts.Node | undefined, found: string[]): void => {
  if (node === undefined) {
    return;
  }

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    found.push(node.text);

    return;
  }

  // A template with holes in it is still prose around the holes. This is the
  // shape that used to walk straight through this file.
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
  ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent);

export const untranslatedStringsIn = (path: string, source: string): readonly EnglishOnly[] => {
  const parsed = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    path.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.TSX,
  );

  const found: EnglishOnly[] = [];

  const reportEach = (node: ts.Node, where: string, texts: readonly string[]): void => {
    for (const text of texts) {
      if (saysSomething(text)) {
        const { line } = parsed.getLineAndCharacterOfPosition(node.getStart(parsed));
        found.push({
          where: `${path}:${String(line + 1)} (${where})`,
          said: text.trim().replace(/\s+/gu, " "),
        });
      }
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      reportEach(node, "JSX text", [node.text]);
    } else if (ts.isJsxExpression(node) && isJsxChild(node)) {
      const drawn: string[] = [];
      renderedLiterals(node.expression, drawn);
      reportEach(node, "drawn expression", drawn);
    } else if (ts.isJsxAttribute(node) && DRAWN_OR_SPOKEN.has(node.name.getText(parsed))) {
      const drawn: string[] = [];
      renderedLiterals(node.initializer, drawn);
      reportEach(node, node.name.getText(parsed), drawn);
    } else if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      DRAWN_OR_SPOKEN.has(node.name.text)
    ) {
      // `options={[{ value: "", label: "Choose a unit…" }]}` — the same prop,
      // one object further in.
      const drawn: string[] = [];
      renderedLiterals(node.initializer, drawn);
      reportEach(node, node.name.text, drawn);
    }

    ts.forEachChild(node, visit);
  };

  visit(parsed);

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
    const escaped = files.flatMap((path) =>
      untranslatedStringsIn(relative(root, path), readFileSync(path, "utf8")).map((one) => one),
    );

    expect(escaped).toEqual([]);
  });
});

/**
 * # The guard itself
 *
 * A guard that catches nothing passes forever. These are the shapes it exists
 * for, written out, so that a change which quietly stops it seeing one fails
 * here rather than in a language nobody on the team reads.
 *
 * The first two are the holes that were actually open: a template expression
 * drawn between two tags, and the word on a form's submit button.
 */
describe("the guard itself", () => {
  const scan = (source: string): readonly string[] =>
    untranslatedStringsIn("sample.tsx", source).map((one) => one.said);

  it("catches a sentence written between two tags", () => {
    expect(scan("const A = () => <Text>Signed in as dario</Text>;")).toEqual([
      "Signed in as dario",
    ]);
  });

  /**
   * The hole. A paragraph with a value interpolated into it, handed to a
   * `<Text>` through braces, was invisible to this file — which is how the
   * scanned-label screen shipped English prose next to an unused key.
   */
  it("catches a paragraph a template draws between two tags", () => {
    expect(
      scan("const A = () => <Text>{`No unit carries the code ${code}. Try another.`}</Text>;"),
    ).toEqual(["No unit carries the code . Try another."]);
  });

  it("catches one a ternary draws between two tags", () => {
    expect(
      scan("const A = () => <Text>{n === 1 ? `1 photo is queued.` : `${n} photos are queued.`}</Text>;"),
    ).toEqual(["1 photo is queued.", "photos are queued."]);
  });

  it("catches a sentence handed to a prop that is drawn", () => {
    expect(scan('const A = () => <TextField label="Password" />;')).toEqual(["Password"]);
  });

  /** The other hole, and the one that made three web dialogs say "Save". */
  it("catches the word on the button that ends a form", () => {
    expect(scan('const A = () => <ItemForm submitLabel="Save" />;')).toEqual(["Save"]);
  });

  it("catches one wearing braces, and one wearing backticks", () => {
    expect(scan('const A = () => <TextField hint={"Optional."} />;')).toEqual(["Optional."]);
    expect(scan("const A = () => <TextField hint={`Optional.`} />;")).toEqual(["Optional."]);
  });

  it("catches one written sideways, as a `children` prop", () => {
    expect(scan('const A = () => <EmptyNote children="Nothing here yet." />;')).toEqual([
      "Nothing here yet.",
    ]);
  });

  it("catches one inside an options array, where a prop hides in an object", () => {
    expect(scan('const A = () => <OptionList options={[{ value: "", label: "Choose…" }]} />;')).toEqual(
      ["Choose…"],
    );
  });

  it("catches an accessible name, which is read aloud and nowhere else", () => {
    expect(scan('const A = () => <Pressable accessibilityLabel="Close" />;')).toEqual(["Close"]);
  });

  it("leaves a message KEY alone, which is the one string that must stay English", () => {
    expect(scan("const A = () => <Text>{t(\"photos.cover\")}</Text>;")).toEqual([]);
    expect(scan('const A = () => <Text>{busy ? t("a.b") : t("c.d")}</Text>;')).toEqual([]);
  });

  it("leaves a translated prop alone", () => {
    expect(scan('const A = () => <TextField label={t("login.password")} />;')).toEqual([]);
  });

  /**
   * The false positive the narrow walk exists to avoid. An icon's name is
   * machinery, and a guard that reported it would be turned off within a week.
   */
  it("leaves the machinery alone: names, routes, roles and modes are not copy", () => {
    expect(
      scan(
        'const A = () => <Pressable role="radio"><Icon name="check" /><Text>{t("x")}</Text></Pressable>;',
      ),
    ).toEqual([]);
    expect(scan('const A = () => <Text>{ok ? <Icon name="check" /> : null}</Text>;')).toEqual([]);
    expect(scan('const A = () => <TextField autoCapitalize="none" keyboardType="email-address" />;')).toEqual(
      [],
    );
  });

  it("leaves a comment alone, which is the whole reason this is a parser", () => {
    expect(scan('const A = () => <Text>{/* label="Password" */}{t("x")}</Text>;')).toEqual([]);
  });

  it("leaves a question about a value alone: a comparison is not a sentence", () => {
    expect(scan('const A = () => <Text hint={typeof children === "string" ? undefined : t("x")} />;')).toEqual(
      [],
    );
  });

  it("leaves punctuation and numbers alone: ×8 is not a sentence", () => {
    expect(scan("const A = () => <Text>×{quantity}</Text>;")).toEqual([]);
  });

  it("leaves the product's own name alone, because it is the same in both languages", () => {
    expect(scan('const A = () => <AppBar title="Waymark" />;')).toEqual([]);
  });

  /**
   * The list this client and the web client must agree on, written out so that
   * dropping one from either is a failing test rather than a silence. The
   * platform's own names are allowed to differ; these are the product's.
   */
  it("watches every prop this product invented, the same ones the web guard does", () => {
    expect([...OUR_OWN_PROPS]).toEqual([
      "caption",
      "children",
      "copiedLabel",
      "copyLabel",
      "error",
      "explains",
      "failedLabel",
      "heading",
      "hint",
      "label",
      "legend",
      "meta",
      "placeholder",
      "secondary",
      "submitLabel",
      "summary",
      "title",
      "valueLabel",
    ]);
  });
});

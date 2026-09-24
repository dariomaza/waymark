import { render, screen } from "@testing-library/react-native";

import { Button } from "./atoms/button.js";
import { Callout } from "./atoms/callout.js";
import { TextField } from "./atoms/text-field.js";
import { colors, space, TAP_TARGET } from "./styles/tokens.js";

/**
 * # The small disagreements this client lost, and the ones it won
 *
 * ADR 22 converged the two clients, and almost everywhere the phone's shape
 * won because the phone is what the owner holds. These are the places where
 * this client was the one that moved, so they are asserted here rather than
 * in the browser's suite.
 *
 * Styles are read off the rendered tree rather than asserted as source, for
 * the same reason the browser's tests ask the cascade: a `StyleSheet.create`
 * entry that nothing applies is a value that is written down and not drawn.
 */
interface RenderedNode {
  readonly props?: { readonly style?: unknown };
  readonly children?: readonly unknown[] | null;
}

const flatten = (style: unknown): Record<string, unknown> =>
  Array.isArray(style)
    ? Object.assign({}, ...style.map(flatten))
    : ((style ?? {}) as Record<string, unknown>);

/** Every style object in a rendered tree, flattened, outermost first. */
const styles = (tree: unknown): Record<string, unknown>[] => {
  const found: Record<string, unknown>[] = [];

  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object") {
      return;
    }

    found.push(flatten((node as RenderedNode).props?.style));

    for (const child of (node as RenderedNode).children ?? []) {
      walk(child);
    }
  };

  walk(tree);

  return found;
};

/** The first rendered style that declares `property` at all. */
const declaring = (tree: unknown, property: string): Record<string, unknown> => {
  const found = styles(tree).find((style) => style[property] !== undefined);
  if (found === undefined) {
    throw new Error(`nothing in that tree declares ${property}`);
  }

  return found;
};

const nothing = (): void => {};

/**
 * The edge on a note was `colors.line` here — a grey stripe on a grey plate,
 * which is a 4px edge nobody can see. The browser drew it in the accent, and
 * an accent edge that does not read is not a quieter accent, it is an absent
 * one. This is the clearest case in the audit of the BROWSER being right.
 */
describe("a note", () => {
  it("is marked with the accent, which is an edge that can actually be seen", async () => {
    const drawn = await render(<Callout tone="note">Still working on it</Callout>);

    expect(declaring(drawn.toJSON(), "borderLeftColor")["borderLeftColor"]).toBe(colors.accent);
  });

  it("still tells a refusal about the world from one about the request", async () => {
    const blocked = await render(<Callout tone="blocked">Still holds things</Callout>);
    const wrong = await render(<Callout tone="wrong">That name is taken</Callout>);

    expect(declaring(blocked.toJSON(), "borderLeftColor")["borderLeftColor"]).toBe(colors.warning);
    expect(declaring(wrong.toJSON(), "borderLeftColor")["borderLeftColor"]).toBe(colors.danger);
  });
});

/**
 * A multiline box with no minimum height is a one-line box that happens to
 * accept newlines, which tells somebody the opposite of what it means. The
 * browser had said 84 since it was written.
 */
describe("a box for several lines of writing", () => {
  it("is tall enough to look like one", async () => {
    const drawn = await render(
      <TextField label="What it is" multiline value="" onChangeText={nothing} />,
    );

    expect(declaring(drawn.toJSON(), "minHeight")["minHeight"]).toBe(84);
  });

  /** And a single-line field is unchanged: the thumb floor, not the tall box. */
  it("leaves an ordinary field at the height a thumb needs", async () => {
    const drawn = await render(<TextField label="Name" value="" onChangeText={nothing} />);

    expect(declaring(drawn.toJSON(), "minHeight")["minHeight"]).toBe(TAP_TARGET);
  });
});

/**
 * # Why a button has no vertical padding
 *
 * It had `paddingVertical: space.s3` on top of a 48 minimum, so a button whose
 * label wrapped grew taller than the button beside it — two controls in one
 * row at two heights, which is the thing a row of peers most obviously must
 * not be. The browser has never had it: the minimum height does the work and
 * the label is centred in whatever height results.
 */
describe("a button", () => {
  it("takes its height from the floor rather than from padding around a word", async () => {
    const drawn = await render(<Button onPress={nothing}>Move</Button>);
    const base = declaring(drawn.toJSON(), "minHeight");

    expect(base["minHeight"]).toBe(TAP_TARGET);
    expect(base["paddingVertical"]).toBeUndefined();
  });

  it("keeps the room a thumb needs around the word", async () => {
    expect(
      declaring((await render(<Button onPress={nothing}>Move</Button>)).toJSON(), "minHeight")[
        "paddingHorizontal"
      ],
    ).toBe(space.s4);
  });

  /**
   * Which is what makes the row of two that ADR 21 settled on actually a row:
   * a long Spanish label and a short English one are the same height.
   */
  it("is the same height whatever its label costs", async () => {
    const short = await render(<Button onPress={nothing}>Edit</Button>);
    const long = await render(
      <Button onPress={nothing}>Añadir un espacio dentro de este</Button>,
    );

    expect(declaring(short.toJSON(), "minHeight")).toEqual(declaring(long.toJSON(), "minHeight"));
  });
});

/** Unchanged, and worth keeping said: the tone that deletes is still outlined. */
describe("the tone that takes something away", () => {
  it("is outlined, which is the shape the browser has now adopted", async () => {
    const drawn = await render(
      <Button tone="danger" onPress={nothing}>
        Delete
      </Button>,
    );
    const base = declaring(drawn.toJSON(), "borderColor");

    expect(base["borderColor"]).toBe(colors.danger);
    expect(base["backgroundColor"]).toBe(colors.surfaceRaised);
    expect(screen.getByText("Delete")).toBeOnTheScreen();
  });
});

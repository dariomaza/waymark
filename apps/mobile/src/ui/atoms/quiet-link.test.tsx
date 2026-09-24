import { fireEvent, render, screen } from "@testing-library/react-native";

import { Button } from "./button.js";
import { QuietLink } from "./quiet-link.js";
import { colors, TAP_TARGET, text } from "../styles/tokens.js";

/**
 * # A way somewhere that is not what the screen is for
 *
 * ADR 21 gave this shape to the browser and named a second site for it that
 * exists on BOTH clients — `photos/views/photo-status-note.tsx`, where "See
 * every photo that failed" was a `quiet` Button doing this shape's job with a
 * button's clothes on. It was left alone at the time because nobody had
 * complained about that screen.
 *
 * This client never got the shape at all, so the same errand was a rectangle
 * here and a word-with-a-picture there. ADR 22 gives it the atom.
 *
 * ## The one thing that must not shrink with it
 *
 * Visual weight and touch area are different things, and this is the shape
 * where they are most easily confused: small text with an icon beside it looks
 * exactly like something that should occupy the height of a line. It must not.
 * A thumb is about 9mm across and this app is used standing up holding a box.
 *
 * That floor is what most of these are about, because it is the part a later
 * tidy-up would take away without anything looking wrong.
 */
interface RenderedNode {
  readonly props?: { readonly style?: unknown };
  readonly children?: readonly unknown[] | null;
}

const flatten = (style: unknown): Record<string, unknown> =>
  Array.isArray(style)
    ? Object.assign({}, ...style.map(flatten))
    : ((style ?? {}) as Record<string, unknown>);

const declaring = (tree: unknown, property: string): Record<string, unknown> => {
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

  const style = found.find((entry) => entry[property] !== undefined);
  if (style === undefined) {
    throw new Error(`nothing in that tree declares ${property}`);
  }

  return style;
};

const nothing = (): void => {};

describe("a quiet way somewhere", () => {
  it("is a way somewhere, and says its own word", async () => {
    await render(
      <QuietLink icon="image" onPress={nothing}>
        See every photo that failed
      </QuietLink>,
    );

    expect(
      screen.getByRole("link", { name: "See every photo that failed" }),
    ).toBeOnTheScreen();
  });

  it("keeps a whole thumb to land on, however small it is drawn", async () => {
    const drawn = await render(
      <QuietLink icon="image" onPress={nothing}>
        See every photo that failed
      </QuietLink>,
    );

    expect(declaring(drawn.toJSON(), "minHeight")["minHeight"]).toBe(TAP_TARGET);
  });

  /**
   * The claim is comparative — lighter than a `Button` — so it is asserted
   * against the thing it is lighter than. An absolute assertion would go on
   * passing on the day somebody took the border off `Button` and the two
   * shapes became one again.
   */
  it("is lighter than the button it is not: no fill and no edge", async () => {
    const quiet = await render(
      <QuietLink icon="image" onPress={nothing}>
        Somewhere
      </QuietLink>,
    );
    const button = await render(<Button onPress={nothing}>Somewhere</Button>);

    expect(declaring(button.toJSON(), "borderWidth")["borderWidth"]).toBe(1);
    expect(declaring(quiet.toJSON(), "minHeight")["borderWidth"]).toBeUndefined();
    expect(declaring(quiet.toJSON(), "minHeight")["backgroundColor"]).toBeUndefined();
  });

  /** Smaller type than the page it sits on, which is the "pequeñito" part. */
  it("reads smaller than the words around it, in the accent as a foreground", async () => {
    await render(
      <QuietLink icon="image" onPress={nothing}>
        Somewhere
      </QuietLink>,
    );

    expect(screen.getByText("Somewhere")).toHaveStyle({
      fontSize: text.s,
      color: colors.accentText,
    });
  });

  it("goes there when it is pressed", async () => {
    const pressed = jest.fn();
    await render(
      <QuietLink icon="image" onPress={pressed}>
        Somewhere
      </QuietLink>,
    );

    await fireEvent.press(screen.getByRole("link", { name: "Somewhere" }));

    expect(pressed).toHaveBeenCalled();
  });
});

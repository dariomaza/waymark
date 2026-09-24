import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { colors } from "../../ui/styles/tokens.js";
import { ItemCard } from "./item-card.js";

const nothing = (): void => {};

/** Every square box this card declares for its picture, photo or no photo. */
const squares = (tree: unknown): number =>
  JSON.stringify(tree).split('"aspectRatio":1').length - 1;

interface RenderedNode {
  readonly props?: { readonly style?: unknown };
  readonly children?: readonly unknown[] | null;
}

/** One style object, whatever mixture of arrays and nulls it was written as. */
const flatten = (style: unknown): Record<string, unknown> =>
  Array.isArray(style)
    ? Object.assign({}, ...style.map(flatten))
    : ((style ?? {}) as Record<string, unknown>);

/**
 * The style of the square the picture goes in, found by the one property that
 * identifies it: a declared aspect ratio of 1. Asking for it by shape rather
 * than by a test id keeps the card free of markup that exists only for a test.
 */
const pictureBox = (tree: unknown): Record<string, unknown> => {
  const found: Record<string, unknown>[] = [];

  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object") {
      return;
    }

    const style = flatten((node as RenderedNode).props?.style);
    if (style["aspectRatio"] === 1) {
      found.push(style);
    }

    for (const child of (node as RenderedNode).children ?? []) {
      walk(child);
    }
  };

  walk(tree);

  const box = found[0];
  if (box === undefined) {
    throw new Error("this card drew no square for its picture");
  }

  return box;
};

describe("one thing, as a card", () => {
  it("is a link named after the thing", async () => {
    await render(<ItemCard name="Cordless drill" onPress={nothing} />);

    expect(screen.getByRole("link", { name: "Cordless drill" })).toBeOnTheScreen();
  });

  it("shows the photo instead of the initials when there is one", async () => {
    await render(
      <ItemCard name="Cordless drill" onPress={nothing} photo={<Text>the photo</Text>} />,
    );

    expect(screen.getByText("the photo")).toBeOnTheScreen();
    expect(screen.queryByText("CD")).toBeNull();
  });

  /**
   * The case that fills most of the grid at the start: forty things get
   * registered in an afternoon and photographed another day. The initials say
   * WHICH thing this is while saying it has no picture.
   */
  it("falls back to initials, without announcing them twice", async () => {
    await render(<ItemCard name="Cinta aislante" onPress={nothing} />);

    expect(screen.getByText("CA")).toBeOnTheScreen();
    // The name a screen reader hears stays the thing's name, not "CA Cinta
    // aislante": reading the initials aloud before the word is noise.
    expect(screen.getByRole("link", { name: "Cinta aislante" })).toBeOnTheScreen();
  });

  /**
   * A thumbnail is an authenticated request and arrives late. If the box grew
   * when it landed, the grid would reflow under a thumb already reaching for
   * a card — so the picture's box is square and declared, either way.
   */
  it("keeps the same box whether or not the photo has arrived", async () => {
    const withNone = await render(<ItemCard name="Cordless drill" onPress={nothing} />);
    const withPhoto = await render(
      <ItemCard name="Cordless drill" onPress={nothing} photo={<Text>the photo</Text>} />,
    );

    expect(squares(withNone.toJSON())).toBe(1);
    expect(squares(withPhoto.toJSON())).toBe(1);
  });

  /**
   * # The one row of the cross-client audit where this client moved
   *
   * The browser drew the picture's box in the SUNKEN plane and this one drew it
   * in the RAISED plane — not a difference of degree, but a recess on one
   * client and a tile on the other, on the densest screen in the product.
   *
   * The phone's shape won almost everywhere else in ADR 22, and here it did
   * not, because this product already had a rule and this file was the thing
   * breaking it: `sunken` is the recess token — a field, an option list, the
   * grey behind a photo — and this client's own `TextField` uses it for
   * exactly that. Most of a new inventory is cells with no photograph yet, so
   * whether forty grey squares read as holes waiting for a picture or as tiles
   * is the whole character of the screen.
   */
  it("draws the picture's box as a recess, which is what both clients now do", async () => {
    const drawn = await render(<ItemCard name="Cordless drill" onPress={nothing} />);

    expect(pictureBox(drawn.toJSON())["backgroundColor"]).toBe(colors.surfaceSunken);
  });

  describe("how many of it there are", () => {
    it("says so when there is more than one", async () => {
      await render(<ItemCard name="HDMI cables" quantity={8} onPress={nothing} />);

      expect(screen.getByText("×8")).toBeOnTheScreen();
    });

    /** "×1" on every single card is noise that hides the cards that mean it. */
    it("stays quiet about the ordinary single thing", async () => {
      await render(<ItemCard name="Cordless drill" quantity={1} onPress={nothing} />);

      expect(screen.queryByText(/^×/)).toBeNull();
    });

    /**
     * The badge sits over the photo rather than under the name because in a
     * card the name is what truncates — and a long name is exactly when you
     * most need to know there are twelve of them.
     */
    it("survives a name far too long for the card", async () => {
      await render(
        <ItemCard
          name="Brocas de pared de widia surtidas en estuche metálico"
          quantity={12}
          onPress={nothing}
        />,
      );

      expect(screen.getByText("×12")).toBeOnTheScreen();
    });
  });

  describe("the one line under the name", () => {
    it("says whatever the screen decided it says", async () => {
      await render(<ItemCard name="Cordless drill" secondary="Box 3" onPress={nothing} />);

      expect(screen.getByText("Box 3")).toBeOnTheScreen();
    });

    /** And it is part of the answer, so it is announced with the name. */
    it("is part of what a screen reader announces", async () => {
      await render(<ItemCard name="Cordless drill" secondary="Box 3" onPress={nothing} />);

      expect(screen.getByRole("link", { name: "Cordless drill, Box 3" })).toBeOnTheScreen();
    });

    it("leaves the line out rather than drawing an empty one", async () => {
      await render(<ItemCard name="Cordless drill" secondary="" onPress={nothing} />);

      expect(screen.getByRole("link", { name: "Cordless drill" })).toBeOnTheScreen();
    });
  });

  /**
   * Where the short line cannot carry the whole answer. In search the card
   * shows the box it is in, but the full breadcrumb and WHY the result is
   * there are the answer — so the screen states the name it wants announced
   * rather than losing them.
   */
  it("lets a screen state the name it wants announced", async () => {
    await render(
      <ItemCard
        name="HDMI 2.1"
        secondary="Box 3"
        label="HDMI 2.1, Garage > Metal wardrobe > Box 3, matched tag"
        onPress={nothing}
      />,
    );

    expect(
      screen.getByRole("link", { name: "HDMI 2.1, Garage > Metal wardrobe > Box 3, matched tag" }),
    ).toBeOnTheScreen();
  });
});

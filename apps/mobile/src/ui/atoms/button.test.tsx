import { render, screen } from "@testing-library/react-native";

import { Button } from "./button.js";

/** As much of a rendered node as this file needs to walk one. */
interface DrawnNode {
  readonly props: Record<string, unknown>;
  readonly children?: readonly (DrawnNode | string)[] | null;
}

/**
 * Is there an icon in this tree at all?
 *
 * `react-native-svg` takes the `viewBox` apart into `vbWidth` and friends, so
 * a node carrying one IS a drawing. Asked this way rather than by a test id,
 * because a test id would be a hook that exists only for the test.
 */
const carriesADrawing = (node: DrawnNode | string | null): boolean => {
  if (node === null || typeof node === "string") {
    return false;
  }

  return "vbWidth" in node.props || (node.children ?? []).some(carriesADrawing);
};

/**
 * # A word with a picture in front of it, and what the picture must not do
 *
 * The owner asked for more icons because a screen of identical word-buttons
 * has no personality and nothing for the eye to aim at. The trap on the way
 * there is announcing the picture as well as the word, so that "Edit" is read
 * out as "pencil Edit" — which is not personality, it is noise, and only the
 * people who cannot see the picture ever hear it.
 */
describe("a button carrying a picture", () => {
  it("is still called exactly what it says", async () => {
    const drawn = await render(
      <Button onPress={() => undefined} icon="pencil">
        Edit
      </Button>,
    );

    expect(carriesADrawing(drawn.toJSON() as DrawnNode | null)).toBe(true);
    expect(screen.getByRole("button", { name: "Edit" })).toBeOnTheScreen();
  });

  it("still reads its word, so nobody has to learn a shape", async () => {
    await render(
      <Button onPress={() => undefined} icon="move">
        Move
      </Button>,
    );

    expect(screen.getByText("Move")).toBeOnTheScreen();
  });

  /**
   * The picture is not a second announcement of the word beside it. A screen
   * reader looking for a label inside this button must find nothing but the
   * button's own.
   */
  it("hides the picture from assistive technology, because the word is there", async () => {
    await render(
      <Button onPress={() => undefined} icon="trash">
        Delete
      </Button>,
    );

    expect(screen.queryByLabelText(/trash/i)).toBeNull();
  });

  /**
   * The escape hatch, and the only shape allowed to drop its word: a control
   * whose name comes from `label` instead. Written down here once rather than
   * rediscovered per screen.
   */
  it("can drop the word entirely, as long as it keeps a name", async () => {
    const drawn = await render(
      <Button onPress={() => undefined} icon="close" label="Close" />,
    );

    expect(carriesADrawing(drawn.toJSON() as DrawnNode | null)).toBe(true);
    expect(screen.getByRole("button", { name: "Close" })).toBeOnTheScreen();
  });
});

import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { colors, text } from "../styles/tokens.js";
import { EmptyNote } from "./empty-note.js";

/**
 * An empty list is a sentence, not a blank area — and on an empty screen the
 * sentence is not a note beside the content: it IS the content.
 */
describe("what an empty place says for itself", () => {
  /**
   * The whole point of the change. Drawn in muted ink at body size, the most
   * important thing on an otherwise empty screen was also its most recessive
   * element.
   */
  it("says it in normal ink, at the size of a title", async () => {
    await render(<EmptyNote>This one is empty</EmptyNote>);

    expect(screen.getByText("This one is empty")).toHaveStyle({
      color: colors.ink,
      fontSize: text.l,
    });
  });

  it("adds a quiet line for what the container is FOR", async () => {
    await render(
      <EmptyNote explains="Whatever you put in here will show up when you scan its label.">
        This one is empty
      </EmptyNote>,
    );

    expect(screen.getByText(/scan its label/i)).toHaveStyle({ color: colors.inkMuted });
  });

  it("leaves that line out rather than drawing an empty one", async () => {
    const drawn = await render(<EmptyNote>This one is empty</EmptyNote>);

    expect(drawn.toJSON()).toMatchObject({ children: [{ children: ["This one is empty"] }] });
  });

  it("carries whatever there is to do about it", async () => {
    await render(<EmptyNote action={<Text>Add an item</Text>}>This one is empty</EmptyNote>);

    expect(screen.getByText("Add an item")).toBeOnTheScreen();
  });
});

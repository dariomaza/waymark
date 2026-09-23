import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { LanguageProvider } from "../../app/language-context.js";
import type { LanguageStore } from "../../app/language.js";
import { Sheet } from "./sheet.js";

/** English, with no keystore behind it: this file asserts a shape, not a word. */
const inEnglish: LanguageStore = {
  read: async () => "en",
  save: async () => undefined,
};

/**
 * # The way out is a picture, and it is still called Close
 *
 * An X in the corner of a panel is one of the few shapes that needs no
 * caption anywhere in the world, and the word was taking a button's width
 * beside a title on a phone held one-handed. What it may not cost is the
 * NAME: an icon-only control with nothing for a screen reader to read is a
 * control somebody can see and nobody else can find.
 */
describe("a sheet that is open", () => {
  const draw = () =>
    render(
      <LanguageProvider store={inEnglish}>
        <Sheet title="Move Box 3" onClose={() => undefined}>
          <Text>Where does it go?</Text>
        </Sheet>
      </LanguageProvider>,
    );

  it("closes with a control that is still called Close", async () => {
    await draw();

    expect(screen.getByRole("button", { name: "Close" })).toBeOnTheScreen();
  });

  /** The word is gone from the screen; only the name it is announced by is left. */
  it("does not print the word beside the title", async () => {
    await draw();

    expect(screen.queryByText("Close")).toBeNull();
  });
});

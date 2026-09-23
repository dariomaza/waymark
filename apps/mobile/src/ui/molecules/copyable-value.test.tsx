import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import type { Clipboard } from "../clipboard.js";
import { ClipboardProvider } from "../clipboard-context.js";
import { TAP_TARGET } from "../styles/tokens.js";
import { CopyableValue } from "./copyable-value.js";

const draw = (clipboard: Clipboard) =>
  render(
    <ClipboardProvider clipboard={clipboard}>
      <CopyableValue
        value="http://localhost:3000"
        valueLabel="The address of this Waymark"
        copyLabel="Copy the address"
        copiedLabel="Address copied"
        failedLabel="This phone would not copy it. Hold the text down to copy it yourself."
      />
    </ClipboardProvider>,
  );

const clipboardThat = (copy: (value: string) => Promise<boolean>): Clipboard => ({ copy });

/**
 * # A string you are meant to take, and the control that takes it
 *
 * It replaces a full-width button under the value — the shape this app has
 * now twice reached for when the missing piece was an icon. The control
 * belongs BESIDE the thing it acts on, so the eye connects the two without a
 * caption having to do it.
 */
describe("a value with its copy control", () => {
  it("shows the value", async () => {
    await draw(clipboardThat(async () => true));

    expect(screen.getByText("http://localhost:3000")).toBeOnTheScreen();
  });

  /**
   * The control is a drawing, and a drawing with no accessible name is a
   * control nobody using a screen reader can press on purpose.
   */
  it("offers a control with no words in it, that still says what it does", async () => {
    await draw(clipboardThat(async () => true));

    expect(
      await screen.findByRole("button", { name: "Copy the address" }),
    ).toBeOnTheScreen();
  });

  /**
   * A thumb is about 9mm across and this app is used standing up, one-handed,
   * holding a box in the other hand. An icon is 20pt; its target is 48.
   */
  it("keeps a thumb-sized target under a drawing that is smaller than one", async () => {
    await draw(clipboardThat(async () => true));

    expect(await screen.findByRole("button", { name: "Copy the address" })).toHaveStyle({
      width: TAP_TARGET,
      height: TAP_TARGET,
    });
  });

  it("hands the exact string to the clipboard", async () => {
    const copied: string[] = [];
    await draw(
      clipboardThat(async (value) => {
        copied.push(value);

        return true;
      }),
    );

    await fireEvent.press(await screen.findByRole("button", { name: "Copy the address" }));

    await waitFor(() => {
      expect(copied).toEqual(["http://localhost:3000"]);
    });
  });

  /**
   * The name flips with the drawing. Somebody who cannot see the tick is told
   * the same thing by the button's own name.
   */
  it("says it worked, in the control itself", async () => {
    await draw(clipboardThat(async () => true));

    await fireEvent.press(await screen.findByRole("button", { name: "Copy the address" }));

    expect(await screen.findByRole("button", { name: "Address copied" })).toBeOnTheScreen();
  });

  /**
   * The refusal is load-bearing: the way out on Android is to hold the text
   * down, and the value is still on screen for exactly that.
   */
  it("says so when the phone refuses, rather than doing nothing", async () => {
    await draw(clipboardThat(async () => false));

    await fireEvent.press(await screen.findByRole("button", { name: "Copy the address" }));

    expect(await screen.findByText(/would not copy it/i)).toBeOnTheScreen();
  });
});

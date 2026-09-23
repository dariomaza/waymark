import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CopyableValue } from "./copyable-value.js";

const clipboardThat = (writeText: (value: string) => Promise<void>): void => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
};

const draw = (): void => {
  render(
    <CopyableValue
      value="http://localhost:3000"
      valueLabel="The address of this Waymark"
      copyLabel="Copy the address"
      copiedLabel="Address copied"
      failedLabel="This browser would not copy it. Select it and copy it by hand."
    />,
  );
};

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * # A string you are meant to take, and the control that takes it
 *
 * It replaces a full-width lime button under the value — the shape this app
 * has now twice reached for when the missing piece was an icon. The control
 * belongs BESIDE the thing it acts on, the way the reveal sits inside the
 * password field, so that the eye connects the two without a caption.
 */
describe("a value with its copy control", () => {
  it("shows the value, named for what it is", () => {
    draw();

    expect(screen.getByText("http://localhost:3000")).toBeVisible();
  });

  /**
   * The control is an icon, and an icon-only control with no accessible name
   * is a trap — so the name is asserted, not the picture.
   */
  it("offers a control with no words in it, that still says what it does", () => {
    draw();

    const copy = screen.getByRole("button", { name: "Copy the address" });
    expect(copy).toHaveTextContent("");
  });

  /**
   * Beside, not underneath. What is asserted is the relationship rather than
   * a pixel: the control and the value share one parent, so no caller can put
   * a paragraph between them.
   */
  it("puts the control next to the value rather than under it", () => {
    draw();

    const value = screen.getByText("http://localhost:3000");
    const copy = screen.getByRole("button", { name: "Copy the address" });

    expect(value.parentElement).toBe(copy.parentElement);
  });

  it("hands the exact string to the clipboard", async () => {
    const copied: string[] = [];
    clipboardThat(async (value) => {
      copied.push(value);
    });
    draw();

    await userEvent.click(screen.getByRole("button", { name: "Copy the address" }));

    await waitFor(() => {
      expect(copied).toEqual(["http://localhost:3000"]);
    });
  });

  /**
   * The name flips and the drawing flips with it. Somebody who cannot see the
   * tick is told the same thing by the button's own name.
   */
  it("says it worked, in the control itself", async () => {
    clipboardThat(async () => undefined);
    draw();

    await userEvent.click(screen.getByRole("button", { name: "Copy the address" }));

    expect(await screen.findByRole("button", { name: "Address copied" })).toBeVisible();
  });

  /**
   * `navigator.clipboard` is genuinely absent over plain HTTP, which is how a
   * self-hosted Waymark on a home network is reached. The sentence is the
   * whole point of the refusal: the value is still on screen to be selected.
   */
  it("says so when the browser refuses, rather than doing nothing", async () => {
    clipboardThat(async () => {
      throw new Error("no clipboard over http");
    });
    draw();

    await userEvent.click(screen.getByRole("button", { name: "Copy the address" }));

    expect(await screen.findByText(/would not copy it/i)).toBeVisible();
  });
});

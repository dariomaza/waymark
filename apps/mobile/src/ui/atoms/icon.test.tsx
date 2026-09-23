import { render, screen } from "@testing-library/react-native";

import { ICON_NAMES, Icon } from "./icon.js";

/**
 * The drawings themselves are not asserted path by path — a test that repeats
 * the `d` attribute only proves the file was copied. What is asserted is what
 * makes nine separate drawings read as ONE set, and what a screen reader is
 * told about a picture.
 */
describe("the icon set both clients draw", () => {
  it("carries every symbol this product has, and no library", () => {
    expect([...ICON_NAMES]).toEqual([
      "waypoints",
      "eye",
      "eyeOff",
      "scan",
      "search",
      "tree",
      "things",
      "box",
      "tag",
      "camera",
      "plus",
    ]);
  });

  /**
   * A common box and a common stroke weight are what stop a set drawn over
   * time from looking like a set collected over time — and they are the same
   * 24 units the web client draws in, so the two clients look like one
   * product rather than two teams.
   */
  it("draws every symbol in the same 24-unit box, on one stroke weight", async () => {
    for (const name of ICON_NAMES) {
      const drawn = (await render(<Icon name={name} />)).toJSON();
      // `react-native-svg` takes the `viewBox` apart into these four, which
      // is the same "0 0 24 24" the web file writes as one string.
      const { minX, minY, vbWidth, vbHeight, strokeWidth } = (
        drawn as { readonly props: Record<string, unknown> }
      ).props;

      expect([minX, minY, vbWidth, vbHeight]).toEqual([0, 0, 24, 24]);
      expect(strokeWidth).toBe(1.7);
    }
  });

  /**
   * The default. An icon beside its own word must be invisible to assistive
   * technology, not merely unlabelled: unlabelled still gets announced, as
   * nothing useful, and announcing the picture and the word says the same
   * thing twice.
   */
  it("says nothing when there is a word beside it", async () => {
    await render(<Icon name="scan" />);

    expect(screen.queryByLabelText(/scan/i)).toBeNull();
  });

  /** And when it is alone, it says what it MEANS, not what it is drawn as. */
  it("says what it means when it stands on its own", async () => {
    await render(<Icon name="waypoints" label="Waymark" />);

    expect(screen.getByLabelText("Waymark")).toBeOnTheScreen();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ICON_NAMES, Icon } from "./icon.js";

/**
 * The drawings themselves are not asserted path by path — a test that repeats
 * the `d` attribute only proves the file was copied. What is asserted is what
 * makes separate drawings read as ONE set, what a screen reader is told about
 * a picture, and that the vocabulary is wide enough that nobody has to reach
 * for a block button because the shape they needed was missing.
 */
describe("the icon set both clients draw", () => {
  /**
   * The list is pinned rather than counted, because the failure this guards
   * against is a name quietly disappearing while the total stays the same.
   *
   * It is the same list the phone client draws, minus `eyeOff`: the web reveal
   * deliberately never flips its icon (see `password-field.tsx`), so a crossed
   * eye here would be a shape with nowhere to be drawn.
   */
  it("carries every symbol this product has, and no library", () => {
    expect([...ICON_NAMES]).toEqual([
      "waypoints",
      "eye",
      "scan",
      "search",
      "tree",
      "things",
      "box",
      "tag",
      "camera",
      "image",
      "plus",
      "check",
      "close",
      "copy",
      "pencil",
      "trash",
      "move",
      "rotate",
      "chevronRight",
      "key",
      "signOut",
      "globe",
    ]);
  });

  /**
   * A common box and a common stroke weight are what stop a set drawn over
   * time from looking like a set collected over time.
   */
  it("draws every symbol in the same 24-unit box, on one stroke weight", () => {
    for (const name of ICON_NAMES) {
      const { container } = render(<Icon name={name} />);
      const svg = container.querySelector("svg");

      expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
      expect(svg).toHaveAttribute("stroke-width", "1.7");
      expect(svg).toHaveAttribute("fill", "none");
    }
  });

  /** Nothing is drawn as a filled blob: the whole set is strokes. */
  it("strokes every symbol rather than filling it", () => {
    for (const name of ICON_NAMES) {
      const { container } = render(<Icon name={name} />);

      for (const shape of container.querySelectorAll("svg *")) {
        expect(shape).not.toHaveAttribute("fill");
      }
    }
  });

  /**
   * The default. An icon beside its own word must be invisible to assistive
   * technology, not merely unlabelled: unlabelled still gets announced, as
   * nothing useful, and announcing the picture and the word says the same
   * thing twice.
   */
  it("says nothing when there is a word beside it", () => {
    const { container } = render(<Icon name="scan" />);

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  /** And when it is alone, it says what it MEANS, not what it is drawn as. */
  it("says what it means when it stands on its own", () => {
    render(<Icon name="waypoints" label="Waymark" />);

    expect(screen.getByRole("img", { name: "Waymark" })).toBeInTheDocument();
  });
});

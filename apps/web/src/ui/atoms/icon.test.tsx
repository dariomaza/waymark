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
   * These are the PRODUCT's names, not lucide's, and that is the point of
   * asserting them: the drawings behind them changed wholesale in ADR 20 and
   * not one of these names had to. It is the same list the phone client
   * draws, minus `eyeOff` — the web reveal deliberately never flips its icon
   * (see `password-field.tsx`), so a crossed eye here would be a name with
   * nothing to draw it for.
   */
  it("carries every symbol this product has, under this product's names", () => {
    expect([...ICON_NAMES]).toEqual([
      "waypoints",
      "eye",
      "scan",
      "search",
      "tree",
      "things",
      "box",
      "tag",
      "tags",
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
      "more",
      "key",
      "signOut",
      "globe",
    ]);
  });

  /**
   * # The assertion that made the library switch safe
   *
   * A common box and a common stroke weight are what stop a set from looking
   * assembled over time — and the mark is still drawn by hand while the other
   * twenty-one come from lucide, whose own default weight is 2. So the risk is
   * precise and this is the test that stands in front of it: one shape landing
   * heavier than the rest, in a set nobody would think to re-measure.
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

  /**
   * The mark is OURS, and stays ours.
   *
   * lucide ships a `waypoints` of its own. Taking it would have made the thing
   * standing for Waymark in the top bar the same picture as a routing feature
   * in a thousand other products, so this one drawing is still drawn in the
   * atom — and this is what says so out loud, because an exception nobody
   * asserts is an exception somebody tidies away.
   */
  it("keeps the product's mark out of the library", () => {
    const { container } = render(<Icon name="waypoints" />);

    expect(container.querySelector("svg")).not.toHaveClass("lucide");
    expect(container.querySelectorAll("svg circle")).toHaveLength(3);
  });

  /**
   * # Every name draws something
   *
   * The map is twenty-one entries pointing at another package's exports, and
   * the failure mode it invites is an entry that resolves to nothing: a
   * renamed export, a bad import, an alias that moved. Every other assertion
   * in this file passes happily for an empty `<svg>` — right box, right
   * weight, right name, nothing inside it — and so does every screen that
   * uses it. The person who finds out is the owner, looking at a gap where a
   * button used to have a picture.
   */
  it("draws at least one shape for every name", () => {
    for (const name of ICON_NAMES) {
      const { container } = render(<Icon name={name} />);

      expect(container.querySelectorAll("svg > *").length).toBeGreaterThan(0);
    }
  });

  /** A caller asking for 20 gets 20: the set is used at three sizes. */
  it("draws at the size it is asked for", () => {
    const { container } = render(<Icon name="copy" size={20} />);

    expect(container.querySelector("svg")).toHaveAttribute("width", "20");
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

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MARK_SMALL, shapesOf } from "@waymark/tokens";

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
      "pinnedW",
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
   * assembled over time — and lucide's own default weight is 2, not ours. So
   * the risk is precise and this is the test that stands in front of it: one
   * shape landing heavier than the rest, in a set nobody would think to
   * re-measure.
   *
   * The mark is the one name drawn on no pen at all (see the next test), so it
   * is held to the box and not to the weight.
   */
  it("draws every symbol in the same 24-unit box, and every stroked one on one weight", () => {
    for (const name of ICON_NAMES) {
      const { container } = render(<Icon name={name} />);
      const svg = container.querySelector("svg");

      expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
      if (name !== "pinnedW") {
        expect(svg).toHaveAttribute("stroke-width", "1.7");
        expect(svg).toHaveAttribute("fill", "none");
      }
    }
  });

  /**
   * The mark is a LETTER — the w of the name, with a pin over it — and a
   * letter is an outline, not a line drawn with a pen. Stroked at 1.7 it would
   * be a w drawn in wire, which is not the mark.
   */
  it("draws the mark filled, in the colour around it, with no pen", () => {
    const { container } = render(<Icon name="pinnedW" />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("fill", "currentColor");
    expect(svg).not.toHaveAttribute("stroke");
    expect(svg).not.toHaveAttribute("stroke-width");
  });

  /**
   * The mark is OURS, and stays ours.
   *
   * The one before it was three rings on a descending path, and lucide ships
   * a `waypoints` that is very nearly the same picture — which is how the
   * thing standing for Waymark came to look like a routing feature in a
   * thousand other products (ADR 24). This one is drawn in the atom from the
   * numbers in `@waymark/tokens`, the same numbers the phone draws, and this
   * is what says so out loud: an exception nobody asserts is an exception
   * somebody tidies away.
   */
  it("keeps the product's mark out of the library, and draws the one both clients share", () => {
    const { container } = render(<Icon name="pinnedW" />);

    expect(container.querySelector("svg")).not.toHaveClass("lucide");
    expect([...container.querySelectorAll("svg path")].map((path) => path.getAttribute("d"))).toEqual(
      shapesOf(MARK_SMALL).map((shape) => shape.d),
    );
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
    render(<Icon name="pinnedW" label="Waymark" />);

    expect(screen.getByRole("img", { name: "Waymark" })).toBeInTheDocument();
  });
});

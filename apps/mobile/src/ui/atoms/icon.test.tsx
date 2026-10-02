import { render, screen } from "@testing-library/react-native";

import { MARK_SMALL, shapesOf } from "@waymark/tokens";

import { ICON_NAMES, Icon } from "./icon.js";
import { DARK as colors } from "@waymark/tokens";

/**
 * The drawings themselves are not asserted path by path — a test that repeats
 * the `d` attribute only proves the file was copied. What is asserted is what
 * makes separate drawings read as ONE set, and what a screen reader is told
 * about a picture.
 */
describe("the icon set both clients draw", () => {
  /**
   * The list is pinned rather than counted, because the failure this guards
   * against is a name quietly disappearing while the total stays the same.
   *
   * These are the PRODUCT's names, not lucide's, and that is the point of
   * asserting them: the drawings behind them changed wholesale in ADR 20 and
   * not one of these names had to. It is the same list, in the same order,
   * that the web client draws in `apps/web/src/ui/atoms/icon.tsx` — plus
   * `eyeOff`, which exists here because THIS reveal flips its icon and the
   * browser's deliberately does not, and `fingerprint`, which draws the one
   * setting only the phone has: unlocking with a finger.
   *
   * `tags` was the one name that used to be on the browser's list and not on
   * this one, and ADR 22 wrote that down as a drift it had found and NOT closed:
   * printing was a browser errand, so the phone had no sheet of labels and a
   * name with nothing to draw it for is speculative. The phone prints now, so
   * the name has a job here and the drift is closed rather than left standing.
   */
  it("carries every symbol this product has, under this product's names", () => {
    expect([...ICON_NAMES]).toEqual([
      "pinnedW",
      "eye",
      "eyeOff",
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
      "sunMoon",
      "sun",
      "moon",
      "info",
      "link",
      "fingerprint",
      "person",
    ]);
  });

  /**
   * # The assertion that made the library switch safe
   *
   * A common box and a common stroke weight are what stop a set from looking
   * assembled over time — and lucide's own default weight is 2, not ours. So
   * the risk is precise and this is the test that stands in front of it: one
   * shape landing heavier than the others, in a set nobody would think to
   * re-measure.
   *
   * They are the same 24 units the web client draws in, so the two clients
   * look like one product rather than two teams. The mark is the one name
   * drawn on no pen (see below), so it is held to the box and not the weight.
   */
  it("draws every symbol in the same 24-unit box, and every stroked one on one weight", async () => {
    for (const name of ICON_NAMES) {
      const drawn = (await render(<Icon name={name} />)).toJSON();
      // `react-native-svg` takes the `viewBox` apart into these four, which
      // is the same "0 0 24 24" the web file writes as one string.
      const { minX, minY, vbWidth, vbHeight, strokeWidth } = (
        drawn as { readonly props: Record<string, unknown> }
      ).props;

      expect([minX, minY, vbWidth, vbHeight]).toEqual([0, 0, 24, 24]);
      if (name !== "pinnedW") {
        expect(strokeWidth).toBe(1.7);
      }
    }
  });

  /**
   * The mark is a LETTER — the w of the name, with a pin over it — and a
   * letter is an outline, not a line drawn with a pen. Stroked at 1.7 it would
   * be a w drawn in wire, which is not the mark.
   */
  it("draws the mark filled, in the colour it is given, with no pen", async () => {
    const drawn = (await render(<Icon name="pinnedW" color={colors.accent} />)).toJSON();
    const { fill, stroke, strokeWidth } = (drawn as { readonly props: Record<string, unknown> })
      .props;

    expect(fill).toBe(colors.accent);
    expect(stroke).toBeUndefined();
    expect(strokeWidth).toBeUndefined();
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

  /**
   * # Every name draws something
   *
   * The map is twenty-two entries pointing at another package's exports, and
   * the failure mode it invites is an entry that resolves to nothing: a
   * renamed export, a bad import, an alias that moved. Every other assertion
   * in this file passes happily for an empty drawing — right box, right
   * weight, right name, nothing inside it. The person who finds out is the
   * owner, looking at a gap where a button used to have a picture.
   */
  it("draws at least one shape for every name", async () => {
    for (const name of ICON_NAMES) {
      const drawn = (await render(<Icon name={name} />)).toJSON() as {
        readonly children?: readonly unknown[] | null;
      } | null;

      expect(drawn?.children ?? []).not.toHaveLength(0);
    }
  });

  /**
   * The mark is OURS, and stays ours.
   *
   * The one before it was three rings on a descending path, and lucide ships
   * a `waypoints` that is very nearly the same picture — which is how the
   * thing standing for Waymark came to look like a routing feature in a
   * thousand other products (ADR 24). This one is drawn in the atom from the
   * numbers in `@waymark/tokens`, the same numbers the browser draws, and this
   * is what says so out loud: an exception nobody asserts is an exception
   * somebody tidies away.
   */
  it("keeps the product's mark out of the library, and draws the one both clients share", async () => {
    const drawn = JSON.stringify((await render(<Icon name="pinnedW" />)).toJSON());

    for (const shape of shapesOf(MARK_SMALL)) {
      expect(drawn).toContain(shape.d);
    }
  });

  /** And when it is alone, it says what it MEANS, not what it is drawn as. */
  it("says what it means when it stands on its own", async () => {
    await render(<Icon name="pinnedW" label="Waymark" />);

    expect(screen.getByLabelText("Waymark")).toBeOnTheScreen();
  });

  /**
   * The same for one of lucide's shapes, which hides every drawing it makes
   * with `aria-hidden` unless told otherwise — so an eye labelled "View only"
   * (ADR 26) was drawn, labelled, and silent.
   */
  it("says what a drawn shape means when it stands on its own", async () => {
    await render(<Icon name="eye" label="View only" />);

    expect(screen.getByRole("image", { name: "View only" })).toBeOnTheScreen();
  });
});

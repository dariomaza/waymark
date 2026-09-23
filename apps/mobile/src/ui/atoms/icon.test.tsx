import { render, screen } from "@testing-library/react-native";

import { ICON_NAMES, Icon } from "./icon.js";

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
   * browser's deliberately does not.
   */
  it("carries every symbol this product has, under this product's names", () => {
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
   * assembled over time — and the mark is still drawn by hand while the rest
   * come from lucide, whose own default weight is 2. So the risk is precise
   * and this is the test that stands in front of it: one shape landing
   * heavier than the others, in a set nobody would think to re-measure.
   *
   * They are the same 24 units the web client draws in, so the two clients
   * look like one product rather than two teams.
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
   * lucide ships a `waypoints` of its own. Taking it would have made the thing
   * standing for Waymark in the top bar the same picture as a routing feature
   * in a thousand other products, so this one drawing is still drawn in the
   * atom — and this is what says so out loud, because an exception nobody
   * asserts is an exception somebody tidies away.
   */
  it("keeps the product's mark out of the library", async () => {
    const drawn = (await render(<Icon name="waypoints" />)).toJSON();

    expect(JSON.stringify(drawn)).toContain("M6.8 7.2l3.4 2.8M13.7 13.3l3.6 3.4");
  });

  /** And when it is alone, it says what it MEANS, not what it is drawn as. */
  it("says what it means when it stands on its own", async () => {
    await render(<Icon name="waypoints" label="Waymark" />);

    expect(screen.getByLabelText("Waymark")).toBeOnTheScreen();
  });
});

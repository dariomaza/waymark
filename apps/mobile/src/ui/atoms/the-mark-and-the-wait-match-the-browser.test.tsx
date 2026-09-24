import { render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, ActivityIndicator } from "react-native";

import { Avatar } from "./avatar.js";
import { Loading } from "./loading.js";
import { colors } from "../styles/tokens.js";

/**
 * # Two atoms that made every screen look like a different app
 *
 * `Loading` is on every screen in the product, usually as the first thing
 * anybody sees. The browser drew a pulsing lime dot in a row, left aligned,
 * with a `prefers-reduced-motion` kill switch; this client drew a centred
 * `ActivityIndicator`. Not a small difference: one is this product's mark
 * waiting, the other is Android's.
 *
 * The dot wins, for the reason ADR 20 kept `waypoints` hand-drawn. A platform
 * spinner is the platform's vocabulary, and a thing that is on every screen of
 * a product is the product's. It is also the one of the two that both
 * platforms can draw identically, which an `ActivityIndicator` is not.
 *
 * Left aligned rather than centred, on both, because a wait sits where the
 * content will appear and then nothing jumps when it arrives.
 */
interface RenderedNode {
  readonly props?: { readonly style?: unknown };
  readonly children?: readonly unknown[] | null;
}

const flatten = (style: unknown): Record<string, unknown> =>
  Array.isArray(style)
    ? Object.assign({}, ...style.map(flatten))
    : ((style ?? {}) as Record<string, unknown>);

const declaring = (tree: unknown, property: string): Record<string, unknown> => {
  const found: Record<string, unknown>[] = [];

  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object") {
      return;
    }

    found.push(flatten((node as RenderedNode).props?.style));

    for (const child of (node as RenderedNode).children ?? []) {
      walk(child);
    }
  };

  walk(tree);

  const style = found.find((entry) => entry[property] !== undefined);
  if (style === undefined) {
    throw new Error(`nothing in that tree declares ${property}`);
  }

  return style;
};

/** Whether the platform's own spinner is anywhere in a rendered tree. */
const spins = (tree: unknown): boolean =>
  JSON.stringify(tree)?.includes("ActivityIndicator") === true;

describe("waiting for something", () => {
  it("still says what it is waiting for, which is the whole point of it", async () => {
    await render(<Loading label="Finding that box" />);

    expect(screen.getByRole("progressbar", { name: "Finding that box" })).toBeOnTheScreen();
    expect(screen.getByText("Finding that box")).toBeOnTheScreen();
  });

  /**
   * The control for the assertion below. `spins` looks for the platform's
   * spinner by the name it renders under, and a predicate that found nothing
   * whatever it was given would make the next test green for the wrong reason.
   */
  it("can tell a platform spinner when it sees one", async () => {
    const drawn = await render(<ActivityIndicator />);

    expect(spins(drawn.toJSON())).toBe(true);
  });

  it("is this product's mark and not the platform's spinner", async () => {
    const drawn = await render(<Loading label="Finding that box" />);

    expect(spins(drawn.toJSON())).toBe(false);
  });

  it("draws the browser's lime dot, at the browser's size", async () => {
    const drawn = await render(<Loading label="Finding that box" />);
    const dot = declaring(drawn.toJSON(), "borderRadius");

    expect(dot["backgroundColor"]).toBe(colors.accent);
    expect(dot["width"]).toBe(10);
    expect(dot["height"]).toBe(10);
  });

  it("sits at the start of the line, where the content will appear", async () => {
    const drawn = await render(<Loading label="Finding that box" />);

    expect(declaring(drawn.toJSON(), "flexDirection")["alignItems"]).toBe("center");
    expect(declaring(drawn.toJSON(), "flexDirection")["flexDirection"]).toBe("row");
  });

  /**
   * The browser's kill switch, which this client had no equivalent of because
   * it had nothing of its own to stop. A pulse is motion, and somebody who has
   * asked their phone for less of it has asked this too.
   */
  it("asks the phone whether to move before it moves", async () => {
    const asked = jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(true);

    await render(<Loading label="Finding that box" />);

    expect(asked).toHaveBeenCalled();
  });
});

/**
 * The browser drew a filled lime disc and this client drew an empty ring. The
 * ring is DELIBERATE in the tab bar, and stays: filled, at that size, in the
 * accent, it reads as the selected tab whichever tab you are actually on.
 *
 * That argument does not reach the 44pt instance on the account screen, which
 * is not in a bar and is not competing with a selected state. There the
 * browser's filled disc wins, so the circle you tapped and the circle you
 * arrived at are the same drawing on both clients.
 */
describe("a person, as a circle", () => {
  it("is a ring by default, which is what the tab bar needs", async () => {
    const drawn = await render(<Avatar name="dario" />);

    expect(declaring(drawn.toJSON(), "borderWidth")["borderWidth"]).toBeGreaterThan(0);
  });

  it("can be filled, which is what the account screen and the browser show", async () => {
    const drawn = await render(<Avatar name="dario" filled size={44} />);
    const disc = declaring(drawn.toJSON(), "borderRadius");

    expect(disc["backgroundColor"]).toBe(colors.accent);
    expect(disc["borderWidth"]).toBe(0);
  });

  it("puts the accent's own ink on it when filled, rather than the page's", async () => {
    await render(<Avatar name="dario" filled size={44} label="You" />);

    expect(screen.getByText("D")).toHaveStyle({ color: colors.accentInk });
  });
});

import { render, screen, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo, ActivityIndicator, Animated } from "react-native";

import { Avatar } from "./avatar.js";
import { Loading } from "./loading.js";
import { DARK as colors, LIGHT, PIN_DROP, SYMBOL, WAIT_MARK_HEIGHT } from "@waymark/tokens";

import { SchemeProvider } from "../styles/theme.js";

/**
 * # Two atoms that made every screen look like a different app
 *
 * `Loading` is on every screen in the product, usually as the first thing
 * anybody sees. This client drew a centred `ActivityIndicator` and the browser
 * a pulsing lime dot; they converged on the dot, because a platform spinner is
 * the platform's vocabulary and a thing on every screen of a product is the
 * product's (ADR 20, ADR 24).
 *
 * The dot was a stand-in for a mark the product did not have yet. The owner:
 * "quiero que hagas la carga animada con nuestro logo, para eso lo hemos
 * creado". So both clients now draw the symbol — the logo's own w and pin —
 * and only the pin moves: it drops onto the w, settles, rests and lifts, on
 * the clock `PIN_DROP` in `@waymark/tokens`. The browser runs the same steps
 * as generated keyframes; this one builds them into an `Animated` sequence.
 *
 * Left aligned rather than centred, on both, because a wait sits where the
 * content will appear and then nothing jumps when it arrives.
 */
interface RenderedNode {
  readonly props?: { readonly style?: unknown } & Record<string, unknown>;
  readonly children?: readonly unknown[] | null;
}

const flatten = (style: unknown): Record<string, unknown> =>
  Array.isArray(style)
    ? Object.assign({}, ...style.map(flatten))
    : ((style ?? {}) as Record<string, unknown>);

const nodes = (tree: unknown): RenderedNode[] => {
  if (tree === null || typeof tree !== "object") {
    return [];
  }

  if (Array.isArray(tree)) {
    return tree.flatMap(nodes);
  }

  const node = tree as RenderedNode;

  return [node, ...(node.children ?? []).flatMap(nodes)];
};

const declaring = (tree: unknown, property: string): Record<string, unknown> => {
  const style = nodes(tree)
    .map((node) => flatten(node.props?.style))
    .find((entry) => entry[property] !== undefined);
  if (style === undefined) {
    throw new Error(`nothing in that tree declares ${property}`);
  }

  return style;
};

/** Whether the platform's own spinner is anywhere in a rendered tree. */
const spins = (tree: unknown): boolean =>
  JSON.stringify(tree)?.includes("ActivityIndicator") === true;

/** Every outline drawn, by its `d`. */
const outlines = (tree: unknown): string[] =>
  nodes(tree)
    .map((node) => node.props?.["d"])
    .filter((d): d is string => typeof d === "string");

/** The drawings, with the fill each is painted in. */
const drawings = (tree: unknown): RenderedNode[] =>
  nodes(tree).filter((node) => node.props?.["vbWidth"] === SYMBOL.width);

const motionless = (): void => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
};

const moving = (): void => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
};

afterEach(() => {
  jest.restoreAllMocks();
});

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

  it("draws the symbol: the approved w and the full pin, nothing else", async () => {
    const drawn = await render(<Loading label="Finding that box" />);

    expect(outlines(drawn.toJSON()).sort()).toEqual(
      [...SYMBOL.letters, ...SYMBOL.pin].map((shape) => shape.d).sort(),
    );
  });

  it("draws it at the browser's height, in the mark's own colour", async () => {
    const drawn = await render(<Loading label="Finding that box" />);
    const svgs = drawings(drawn.toJSON());

    expect(svgs.length).toBeGreaterThan(0);
    for (const svg of svgs) {
      expect(svg.props?.["height"]).toBe(WAIT_MARK_HEIGHT);
      expect(svg.props?.["fill"]).toBe(colors.mark);
    }
  });

  /** Never lime on white: on the light page the mark is ink (ADR 24). */
  it("is ink on the light page", async () => {
    const drawn = await render(
      <SchemeProvider scheme="light">
        <Loading label="Finding that box" />
      </SchemeProvider>,
    );

    for (const svg of drawings(drawn.toJSON())) {
      expect(svg.props?.["fill"]).toBe(LIGHT.mark);
    }
  });

  it("sits at the start of the line, where the content will appear", async () => {
    const drawn = await render(<Loading label="Finding that box" />);

    expect(declaring(drawn.toJSON(), "flexDirection")["alignItems"]).toBe("center");
    expect(declaring(drawn.toJSON(), "flexDirection")["flexDirection"]).toBe("row");
  });

  /**
   * The browser's clock, step for step: the same stretches, the same length,
   * the same curve. Each stretch is one `Animated.timing`, so what this
   * client will run is read off what it asked for.
   */
  it("drops the pin on the browser's clock, and loops", async () => {
    moving();
    const timing = jest.spyOn(Animated, "timing");
    const loop = jest.spyOn(Animated, "loop");

    await render(<Loading label="Finding that box" />);

    await waitFor(() => {
      expect(loop).toHaveBeenCalled();
    });

    const stretches = timing.mock.calls.map(([, config]) => config);
    const expected = PIN_DROP.steps.slice(1).map((step, index) => ({
      toValue: step.y,
      duration: (step.at - (PIN_DROP.steps[index]?.at ?? 0)) * PIN_DROP.durationMs,
    }));

    expect(stretches.map(({ toValue, duration }) => ({ toValue, duration }))).toEqual(
      expected.map(({ toValue, duration }) => ({ toValue, duration: expect.closeTo(duration, 6) })),
    );
    for (const stretch of stretches) {
      expect(stretch.useNativeDriver).toBe(true);
      expect(stretch.easing).toBeInstanceOf(Function);
    }
  });

  /**
   * The browser's kill switch. A drop is motion, and somebody who has asked
   * their phone for less of it has asked this too: the pin rests in its place,
   * which is the mark as it is drawn everywhere else.
   */
  it("goes still, with the pin in its place, for somebody who asked for less motion", async () => {
    motionless();
    const loop = jest.spyOn(Animated, "loop");

    const drawn = await render(<Loading label="Finding that box" />);

    await waitFor(() => {
      expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled();
    });

    expect(loop).not.toHaveBeenCalled();
    expect(declaring(drawn.toJSON(), "transform")["transform"]).toEqual([{ translateY: 0 }]);
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

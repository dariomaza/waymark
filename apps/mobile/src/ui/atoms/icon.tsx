import type { JSX } from "react";
import { Circle, Path, Rect, Svg } from "react-native-svg";

import { colors } from "../styles/tokens.js";

/**
 * The whole icon set, drawn here.
 *
 * No icon library. There are nine symbols in this product, and the smallest
 * useful icon package is hundreds of kilobytes plus a dependency to keep
 * current — for nine shapes that never change. These are the same paths the
 * web client draws in `apps/web/src/ui/atoms/icon.tsx`, so the two clients
 * look like one product.
 *
 * Every icon is a 24-unit square on a common stroke weight, which is what
 * stops a set drawn over time from looking like a set collected over time.
 *
 * # What is different from the web file, and why
 *
 * `currentColor` does not exist here. SVG on the web inherits the colour of
 * the text around it; React Native has no cascade, so the colour is a PROP
 * with the page's ink as its default. A caller that wants the accent — the
 * tab you are on — passes it, rather than relying on an ancestor.
 */
export const ICON_NAMES = [
  /**
   * Three waypoints on a descending path: the product's mark.
   *
   * Named for what is drawn and not for the product, the way every other
   * name in this list is. The one before it was called `thread` — the thread
   * out of a labyrinth — which named a story rather than a shape, and when
   * the story changed the name was left pointing at nothing.
   */
  "waypoints",
  /** The pair a password field toggles between. */
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
] as const;

export type IconName = (typeof ICON_NAMES)[number];

const PATHS: Record<IconName, JSX.Element> = {
  /**
   * Rings and not dots, because a filled shape at this stroke weight reads as
   * a bullet point rather than as a marker — and the joining strokes stop at
   * each ring's edge rather than running under it, so the path is a route
   * BETWEEN the markers instead of a line with beads threaded on it.
   */
  waypoints: (
    <>
      <Circle cx="5" cy="5.6" r="2.4" />
      <Circle cx="12" cy="11.6" r="2.4" />
      <Circle cx="19" cy="18.4" r="2.4" />
      <Path d="M6.8 7.2l3.4 2.8M13.7 13.3l3.6 3.4" />
    </>
  ),
  scan: (
    <>
      <Path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16" />
      <Rect x="7" y="7" width="4" height="4" rx="1" />
      <Rect x="13" y="13" width="4" height="4" rx="1" />
    </>
  ),
  search: (
    <>
      <Circle cx="11" cy="11" r="6.5" />
      <Path d="M16 16l4.5 4.5" />
    </>
  ),
  tree: (
    <>
      <Rect x="3" y="3.5" width="7" height="6" rx="1.5" />
      <Rect x="14" y="14.5" width="7" height="6" rx="1.5" />
      <Rect x="3" y="14.5" width="7" height="6" rx="1.5" />
      <Path d="M6.5 9.5v5" />
    </>
  ),
  things: (
    <>
      <Path d="M12 2.8l8 4.2v10L12 21.2 4 17V7z" />
      <Path d="M4 7l8 4.2L20 7M12 11.2v10" />
    </>
  ),
  box: (
    <>
      <Path d="M3 7.5l9-4.5 9 4.5v9L12 21l-9-4.5z" />
      <Path d="M3 7.5l9 4.5 9-4.5M12 12v9" />
    </>
  ),
  tag: (
    <>
      <Path d="M3 11V4.5A1.5 1.5 0 0 1 4.5 3H11l9.5 9.5a1.5 1.5 0 0 1 0 2.1l-6 6a1.5 1.5 0 0 1-2.1 0z" />
      <Circle cx="7.5" cy="7.5" r="1.4" />
    </>
  ),
  camera: (
    <>
      <Path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.2-2h8.2l1.2 2h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
      <Circle cx="12" cy="13" r="3.4" />
    </>
  ),
  eye: (
    <>
      <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <Circle cx="12" cy="12" r="3.2" />
    </>
  ),
  /** The same eye with the universal stroke through it, so the pair reads as one control. */
  eyeOff: (
    <>
      <Path d="M2.5 12S6 5.5 12 5.5c1.6 0 3 .5 4.2 1.1M21.5 12s-1.4 2.6-4 4.4M9.5 17.9c.8.3 1.6.6 2.5.6" />
      <Path d="M9.8 9.8a3.2 3.2 0 0 0 4.4 4.4" />
      <Path d="M3.5 3.5l17 17" />
    </>
  ),
  plus: <Path d="M12 5v14M5 12h14" />,
};

export interface IconProps {
  readonly name: IconName;
  /** Points, square. Defaults to the size that reads on a phone. */
  readonly size?: number;
  /** The stroke. The page's ink unless the caller means something by it. */
  readonly color?: string;
  /**
   * What this icon MEANS, when it carries meaning on its own.
   *
   * Left out, the icon is hidden from assistive technology — which is right
   * whenever there is a visible label beside it, because announcing the
   * picture and the word is announcing the same thing twice.
   */
  readonly label?: string | undefined;
}

export const Icon = ({
  name,
  size = 22,
  color = colors.ink,
  label,
}: IconProps): JSX.Element => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    // A decorative icon must be INVISIBLE to a screen reader, not merely
    // unlabelled: unlabelled still gets announced, as nothing useful. Android
    // and iOS hide a subtree with different props, so both are stated.
    accessible={label !== undefined}
    accessibilityElementsHidden={label === undefined}
    importantForAccessibility={label === undefined ? "no-hide-descendants" : "yes"}
    {...(label === undefined ? {} : { accessibilityRole: "image" as const, accessibilityLabel: label })}
  >
    {PATHS[name]}
  </Svg>
);

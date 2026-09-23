import type { JSX } from "react";
import { Circle, Path, Rect, Svg } from "react-native-svg";

import { colors } from "../styles/tokens.js";

/**
 * The whole icon set, drawn here.
 *
 * No icon library. These are the shapes this product actually uses, and the
 * smallest useful icon package is hundreds of kilobytes plus a dependency to
 * keep current — for a couple of dozen drawings that never change. These are
 * the same paths the web client draws in `apps/web/src/ui/atoms/icon.tsx`, so
 * the two clients look like one product.
 *
 * Every icon is a 24-unit square on a common stroke weight, which is what
 * stops a set drawn over time from looking like a set collected over time.
 *
 * # Why the set is this wide, and not eleven shapes
 *
 * It WAS eleven, and that was the disease rather than a virtue. When the shape
 * a screen needs does not exist, whoever is writing that screen reaches for the
 * thing that always exists — a full-width button with a word in it — and the
 * screen grows another block. A vocabulary wide enough to say "copy", "edit",
 * "move" and "done" is what stops the next one.
 *
 * Wide is not the same as complete. A shape earns its place by being drawn
 * somewhere, and an icon nobody can read without a caption beside it is worse
 * than the caption on its own — so the rare and the destructive keep their
 * words, with a shape in front of them rather than instead of them.
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
  /** Taking a new photograph. */
  "camera",
  /** A photograph that already exists — the library, not the shutter. */
  "image",
  "plus",
  /** It worked. The answer to a `copy`, and nothing else so far. */
  "check",
  "close",
  "copy",
  "pencil",
  "trash",
  "move",
  "rotate",
  /** There is more of this behind the row you are looking at. */
  "chevronRight",
  /** A credential: a passkey, or a key handed to a program. */
  "key",
  "signOut",
  /** The language this is read in. A globe, because no flag is a language. */
  "globe",
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
  /**
   * A frame with a horizon in it, and not a second camera. The pair is a
   * choice — take one now, or pick one already taken — and two shapes that
   * both said "camera" would hide that there is a choice at all.
   */
  image: (
    <>
      <Rect x="3.2" y="4.5" width="17.6" height="15" rx="2" />
      <Circle cx="8.6" cy="9.8" r="1.6" />
      <Path d="M3.2 16.3l4.6-4.3a1.8 1.8 0 0 1 2.4 0l6.3 5.8M15.4 14.2l1.5-1.4a1.8 1.8 0 0 1 2.4 0l1.5 1.4" />
    </>
  ),
  plus: <Path d="M12 5v14M5 12h14" />,
  /**
   * The tick starts low and left and travels up and right, which is the way
   * a hand draws one — a symmetric V reads as a chevron pointing down.
   */
  check: <Path d="M4.5 12.5l5 5 10-11" />,
  close: <Path d="M5.5 5.5l13 13M18.5 5.5l-13 13" />,
  /**
   * Two sheets, the second showing from behind the first. The back sheet is
   * an OPEN path — it stops where the front one covers it — so the two read
   * as one in front of the other rather than as two overlapping outlines.
   */
  copy: (
    <>
      <Rect x="9" y="9" width="11" height="11" rx="2" />
      <Path d="M6 15H5.5A1.5 1.5 0 0 1 4 13.5v-8A1.5 1.5 0 0 1 5.5 4h8A1.5 1.5 0 0 1 15 5.5V6" />
    </>
  ),
  /**
   * The ferrule crosses the body rather than sitting beside it, which is what
   * separates a pencil from a plain diagonal bar at this size.
   */
  pencil: (
    <>
      <Path d="M4 20.2v-3.4L16.4 4.4a1.8 1.8 0 0 1 2.6 0l1 1a1.8 1.8 0 0 1 0 2.6L7.6 20.2z" />
      <Path d="M14.4 6.4l3.6 3.6" />
    </>
  ),
  /**
   * A bin, and the one shape in this set that only ever appears IN FRONT OF
   * its own word. Deleting is the act nobody should perform from a picture.
   */
  trash: (
    <>
      <Path d="M5.5 6.5h13" />
      <Path d="M9.5 6.5V4.9A1.4 1.4 0 0 1 10.9 3.5h2.2a1.4 1.4 0 0 1 1.4 1.4v1.6" />
      <Path d="M6.8 6.5l.8 12.2a1.8 1.8 0 0 0 1.8 1.7h5.2a1.8 1.8 0 0 0 1.8-1.7l.8-12.2" />
      <Path d="M10.3 10.3v6M13.7 10.3v6" />
    </>
  ),
  /**
   * Arrows to all four sides, because moving a box in Waymark is not a
   * direction: it is picking the thing up and putting it somewhere else.
   */
  move: (
    <>
      <Path d="M12 3.5v17M3.5 12h17" />
      <Path d="M9 6.5l3-3 3 3M9 17.5l3 3 3-3M6.5 9l-3 3 3 3M17.5 9l3 3-3 3" />
    </>
  ),
  /**
   * A ring with a bite out of it and an arrowhead in the gap. The gap is at
   * the top right and the head points clockwise, which is the direction every
   * "do it again" arrow in the world turns.
   */
  rotate: (
    <>
      <Path d="M20.5 12a8.5 8.5 0 1 1-8.5-8.5c2.4 0 4.7 1 6.4 2.6L20.5 8.2" />
      <Path d="M20.5 3.7v4.5H16" />
    </>
  ),
  chevronRight: <Path d="M9.5 5.5l6.5 6.5-6.5 6.5" />,
  /**
   * The ring is a circle and the teeth are on the shaft, so the shape reads
   * as a key at 20pt rather than as a lollipop.
   */
  key: (
    <>
      <Circle cx="8" cy="16" r="4" />
      <Path d="M10.9 13.1L20 4M17.3 6.7l2.2 2.2M15.1 8.9l2.2 2.2" />
    </>
  ),
  /** A doorway, and an arrow going OUT through it rather than in. */
  signOut: (
    <>
      <Path d="M14.5 3.5H18a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-3.5" />
      <Path d="M4 12h10.5" />
      <Path d="M11 8.5l3.5 3.5-3.5 3.5" />
    </>
  ),
  /**
   * A globe and never a flag. A flag is a country; the two languages here are
   * spoken in dozens of them, and picking one of those countries to stand for
   * a language tells everybody else it is not theirs.
   */
  globe: (
    <>
      <Circle cx="12" cy="12" r="8.5" />
      <Path d="M4 9.2h16M4 14.8h16" />
      <Path d="M12 3.5c-2.3 2.3-3.6 5.3-3.6 8.5s1.3 6.2 3.6 8.5c2.3-2.3 3.6-5.3 3.6-8.5S14.3 5.8 12 3.5z" />
    </>
  ),
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

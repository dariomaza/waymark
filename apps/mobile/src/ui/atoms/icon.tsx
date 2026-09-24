import {
  Box,
  Boxes,
  Camera,
  Check,
  ChevronRight,
  Copy,
  EllipsisVertical,
  Eye,
  EyeOff,
  Globe,
  Image,
  Key,
  LogOut,
  Move,
  Network,
  Pencil,
  Plus,
  RotateCw,
  ScanQrCode,
  Search,
  Tag,
  Tags,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react-native";
import type { JSX } from "react";
import { Circle, Path, Svg } from "react-native-svg";

import { colors } from "../styles/tokens.js";

/**
 * # The whole icon set, and the one seam it comes through
 *
 * Screens ask this atom for a name out of THIS product's vocabulary and get a
 * drawing back. Nothing outside this file knows where the drawings come from,
 * which is the only reason the answer to that question was able to change.
 *
 * ## It used to be shapes drawn by hand, and it is not any more
 *
 * The rule this file used to carry said: no icon library, because the set is
 * a handful of symbols that never change and the smallest package is hundreds
 * of kilobytes. Both halves of that failed — the set was not enough to say
 * "copy", and the kilobytes were the package on disk rather than the bundle.
 *
 * What decided it was neither: `lucide-react` and `lucide-react-native` are
 * published in lockstep from one design source, so this file and its web twin
 * cannot drift apart the way two hand-maintained drawings quietly do. That
 * drift was the strongest argument FOR drawing them here, and it is the one
 * the library answers. ADR 20 records the reversal and what it costs.
 *
 * ## What is different from the web file, and why
 *
 * `currentColor` does not exist here. SVG on the web inherits the colour of
 * the text around it; React Native has no cascade, so the colour is a PROP
 * with the page's ink as its default. A caller that wants the accent — the
 * tab you are on — passes it, rather than relying on an ancestor.
 *
 * This file also carries `eyeOff`, which the web one does not: the reveal on
 * this password field flips its icon and the browser's deliberately does not.
 */
export const ICON_NAMES = [
  /**
   * Three waypoints on a descending path: the product's MARK, and the one
   * drawing in this file that is still drawn in this file.
   *
   * It is not a generic symbol and it must not become somebody else's shape.
   * lucide happens to ship a `waypoints` too; taking it would mean the thing
   * standing for Waymark in the top bar was the same picture as a routing
   * feature in a thousand other products. These are the same coordinates the
   * web client draws, which is the one place the two files still have to be
   * kept honest by hand.
   *
   * Named for what is drawn and not for the product, the way every other name
   * in this list is. The one before it was called `thread` — the thread out of
   * a labyrinth — which named a story rather than a shape, and when the story
   * changed the name was left pointing at nothing.
   */
  "waypoints",
  /** The pair a password field toggles between. */
  "eye",
  "eyeOff",
  "scan",
  "search",
  /** The storage hierarchy — the "Places" tab. */
  "tree",
  /** Everything you own, all at once — the "Things" tab. */
  "things",
  /** One container. Distinct from `things` on purpose: one box, not many. */
  "box",
  "tag",
  /**
   * Several labels at once: a SHEET of them, which is a different errand from
   * sticking one on a box. Distinct from `tag` the way `things` is distinct
   * from `box` — many, not one.
   *
   * This was the browser's one extra name, and ADR 22 wrote it down as a drift
   * it had found and deliberately not closed: printing was a browser errand, so
   * the phone had no sheet and a name with nothing to draw it for is
   * speculative in the other direction. The phone prints now (ADR 21, amended),
   * so the name is earned rather than added for symmetry.
   */
  "tags",
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
  /**
   * The overflow: everything a screen can do that is not the thing it is FOR.
   *
   * Vertical dots rather than horizontal, because this control sits at the end
   * of a heading line beside the name of what is on screen, and that position
   * has meant "the rest of this thing's menu" on a phone for fifteen years.
   * Reading it takes nobody a moment. See ADR 21 for what is behind it and why.
   */
  "more",
  /** A credential: a passkey, or a key handed to a program. */
  "key",
  "signOut",
  /** The language this is read in. A globe, because no flag is a language. */
  "globe",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/**
 * The map from this product's vocabulary onto lucide's.
 *
 * `waypoints` is deliberately absent — it is the mark, and it is drawn below.
 * Everything else is one of theirs, and the KEY is always ours: renaming
 * `things` to whatever lucide calls a stack of boxes would put somebody
 * else's vocabulary in front of every screen in this app.
 *
 * It is the same table, in the same order, as the web client's — which is now
 * the only thing the two files have to agree on, instead of forty paths.
 */
const DRAWN_BY_LUCIDE: Record<Exclude<IconName, "waypoints">, LucideIcon> = {
  eye: Eye,
  eyeOff: EyeOff,
  /** Corner brackets around a code, which is exactly what the camera does. */
  scan: ScanQrCode,
  search: Search,
  /** A real hierarchy — a parent joined to its children — and not three tiles. */
  tree: Network,
  /** Several cubes, so "Things" cannot be mistaken for one container. */
  things: Boxes,
  box: Box,
  tag: Tag,
  tags: Tags,
  camera: Camera,
  image: Image,
  plus: Plus,
  check: Check,
  close: X,
  copy: Copy,
  pencil: Pencil,
  trash: Trash2,
  move: Move,
  rotate: RotateCw,
  chevronRight: ChevronRight,
  more: EllipsisVertical,
  /**
   * `Key` and not `KeyRound`: the round one draws its bit as a filled dot,
   * which at 20pt on a phone reads as a smudge rather than as a key.
   */
  key: Key,
  signOut: LogOut,
  globe: Globe,
};

/**
 * The one stroke weight the whole set is drawn on.
 *
 * lucide's own default is 2, which is heavier than this app has ever drawn.
 * Stated here once so the mark and the library agree, rather than at every
 * call site, where the first person to forget it would break the set.
 */
const STROKE = 1.7;

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

/**
 * How a drawing is announced, or hidden.
 *
 * A decorative icon must be INVISIBLE to a screen reader, not merely
 * unlabelled: unlabelled still gets announced, as nothing useful. Android and
 * iOS hide a subtree with different props, so both are stated.
 */
const spokenAs = (
  label: string | undefined,
): Record<string, unknown> =>
  label === undefined
    ? {
        accessible: false,
        accessibilityElementsHidden: true,
        importantForAccessibility: "no-hide-descendants",
      }
    : {
        accessible: true,
        accessibilityElementsHidden: false,
        importantForAccessibility: "yes",
        accessibilityRole: "image",
        accessibilityLabel: label,
      };

export const Icon = ({
  name,
  size = 22,
  color = colors.ink,
  label,
}: IconProps): JSX.Element => {
  const spoken = spokenAs(label);

  if (name === "waypoints") {
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...spoken}
      >
        {/*
          Rings and not dots, because a filled shape at this stroke weight
          reads as a bullet point rather than as a marker — and the joining
          strokes stop at each ring's edge rather than running under it, so the
          path is a route BETWEEN the markers instead of a line with beads
          threaded on it.
        */}
        <Circle cx="5" cy="5.6" r="2.4" />
        <Circle cx="12" cy="11.6" r="2.4" />
        <Circle cx="19" cy="18.4" r="2.4" />
        <Path d="M6.8 7.2l3.4 2.8M13.7 13.3l3.6 3.4" />
      </Svg>
    );
  }

  const Drawn = DRAWN_BY_LUCIDE[name];

  return <Drawn size={size} color={color} strokeWidth={STROKE} {...spoken} />;
};

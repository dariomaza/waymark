import {
  Box,
  Boxes,
  Camera,
  Check,
  ChevronRight,
  Copy,
  EllipsisVertical,
  Eye,
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
} from "lucide-react";
import type { JSX } from "react";

import { MARK_SMALL, shapesOf } from "@waymark/tokens";

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
 * ten symbols that never change and the smallest package is hundreds of
 * kilobytes. Both halves of that failed. Ten was not enough — a vocabulary too
 * thin to say "copy" is why two features in a row shipped a full-width word
 * button where an icon belonged — and "hundreds of kilobytes" was the package
 * on disk, not the bundle: a tree-shaken ESM import ships the shapes actually
 * named here and nothing else.
 *
 * What decided it was neither of those: it was that `lucide-react` and
 * `lucide-react-native` are published in lockstep from one design source, so
 * the two clients cannot drift apart the way two hand-maintained files
 * quietly do. ADR 20 records the whole reversal, including what it costs.
 *
 * ## The names are ours, the drawings are theirs
 *
 * `IconName` is the product's vocabulary and it does not change when lucide
 * renames something: `things` is what this app calls the tab, whatever the
 * shape behind it is called. Nothing imports from `lucide-react` except this
 * file, and a screen that wants a shape with no name here should add a name
 * here rather than reach past the seam.
 *
 * Every icon is a 24-unit square on one stroke weight, which is what stops a
 * set drawn over time from looking like a set collected over time — and is
 * now, simply, true of every shape in the family. The mark keeps the square
 * and not the weight: it is a letter, filled, not a line.
 */
export const ICON_NAMES = [
  /**
   * The w of the name with a pin over it: the product's MARK, and the one
   * drawing in this file that lucide does not draw.
   *
   * It is not a generic symbol and it must not become somebody else's shape.
   * The mark before it was three rings on a descending path, and lucide ships
   * a `waypoints` that is nearly the same picture — the thing standing for
   * Waymark was a routing icon in a thousand other products (ADR 24).
   *
   * This is the SMALL cut, the one with a solid pin: at icon size the full
   * pin's hole and core close up. It is drawn from `MARK_SMALL` in
   * `@waymark/tokens`, the numbers the phone draws too.
   *
   * Named for what is drawn and not for the product, the way every other name
   * in this list is. The ones before it were `thread` and `waypoints`, and
   * both were left naming a drawing that no longer existed once the drawing
   * changed; `pinnedW` will be too, and that is the right failure: a rename
   * that touches every caller, rather than a name that quietly lies.
   */
  "pinnedW",
  /**
   * The reveal on a password field. It never changes with the state: the
   * control means "showing the password", and whether it is ON is carried by
   * `aria-pressed` and by the fill — one vocabulary for "this is on" across
   * the app. An icon that swapped for a crossed-out eye would be a second,
   * contradictory answer beside a label that deliberately does not flip.
   *
   * Which is why there is no `eyeOff` here and there is one on the phone: the
   * phone's reveal does flip, and a name with nothing to draw it for is not a
   * name this file should carry.
   */
  "eye",
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
   * It was deliberately absent while the sheet was a line in a menu, on the
   * grounds that nothing in the set meant "a page of labels" and a shape
   * somebody has to learn by pressing it is worse than the words. What changed
   * is that the control lost its rectangle: a quiet line of small text with no
   * picture beside it reads as a caption rather than as a way somewhere, so
   * here the shape is carrying its share of the meaning rather than repeating
   * the word.
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
 * `pinnedW` is deliberately absent — it is the mark, and it is drawn below.
 * Everything else is one of theirs, and the KEY is always ours: renaming
 * `things` to whatever lucide calls a stack of boxes would put somebody
 * else's vocabulary in front of every screen in this app.
 */
const DRAWN_BY_LUCIDE: Record<Exclude<IconName, "pinnedW">, LucideIcon> = {
  eye: Eye,
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
   * which at 20px on a phone reads as a smudge rather than as a key.
   */
  key: Key,
  signOut: LogOut,
  globe: Globe,
};

/**
 * The mark's outlines, one `<path>` each. Filled and never stroked: it is a
 * letter, and a letter is an outline rather than a line drawn with a pen.
 */
const PINNED_W = shapesOf(MARK_SMALL).map((shape) => <path key={shape.d} d={shape.d} />);

/**
 * The one stroke weight the whole set is drawn on.
 *
 * lucide's own default is 2, which is heavier than this app has ever drawn.
 * Stated here once, rather than at every call site, where the first person to
 * forget it would break the set. The mark is the one drawing it does not
 * reach: it is filled, not stroked.
 */
const STROKE = 1.7;

export interface IconProps {
  readonly name: IconName;
  /** Pixels, square. Defaults to the size that reads on a phone. */
  readonly size?: number;
  /**
   * What this icon MEANS, when it carries meaning on its own.
   *
   * Left out, the icon is hidden from assistive technology — which is right
   * whenever there is a visible label beside it, because announcing the
   * picture and the word is announcing the same thing twice.
   *
   * On a control with no words in it at all, this is NOT where the name
   * belongs either: put it on the button, where a screen reader looks for the
   * name of the thing it is about to press.
   */
  readonly label?: string;
}

export const Icon = ({ name, size = 22, label }: IconProps): JSX.Element => {
  // A decorative icon must be invisible to a screen reader, not merely
  // unlabelled: unlabelled still gets announced, as nothing useful.
  const spoken =
    label === undefined
      ? ({ "aria-hidden": true } as const)
      : ({ role: "img", "aria-label": label } as const);

  if (name === "pinnedW") {
    return (
      <svg
        className="icon"
        width={size}
        height={size}
        viewBox={MARK_SMALL.viewBox}
        fill="currentColor"
        focusable={false}
        {...spoken}
      >
        {PINNED_W}
      </svg>
    );
  }

  const Drawn = DRAWN_BY_LUCIDE[name];

  return (
    <Drawn className="icon" size={size} strokeWidth={STROKE} focusable={false} {...spoken} />
  );
};

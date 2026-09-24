import { initialsOf } from "@waymark/api-client";
import type { CSSProperties, JSX } from "react";

import "./avatar.css";

export interface AvatarProps {
  /** Whatever the person is called. The letters are derived, never passed in. */
  readonly name: string;
  /** Pixels, square. Defaults to the size that reads in the bottom bar. */
  readonly size?: number;
  /**
   * A solid disc rather than a ring.
   *
   * The ring is right in the tab bar and wrong everywhere else, which is why
   * this is a prop and not a second component. See below.
   */
  readonly filled?: boolean;
}

/**
 * A person, as a circle with their initial in it.
 *
 * There are no profile pictures in this product and there is no reason to
 * invent one: a photograph here would be the only image in the app that is
 * not of a thing in a box. An initial is enough to say "this is you and not
 * the inventory", which is the entire job of the control it sits inside.
 *
 * `initialsOf` comes from `@waymark/api-client` — the same function the item
 * cards fill an empty photo slot with. It is already written, already tested
 * against accents and emoji, and writing a second one is how two parts of one
 * screen start disagreeing about what somebody is called.
 *
 * ## A ring by default, which is a decision about the BAR
 *
 * This used to be a filled lime disc always, because the one place it was drawn
 * was the top bar. It is a tab icon now, and ADR 22 had already settled what a
 * tab's avatar looks like on the other client: filled, at that size, in the
 * accent, it reads as the SELECTED tab whichever tab you are actually on. So a
 * ring here, and the phone's atom has the same default for the same reason.
 *
 * The 44px instance on the account screen is not competing with a selected
 * state, so it asks for `filled` — and the circle you tapped and the circle you
 * arrived at are the same drawing on both clients.
 *
 * Hidden from assistive technology on purpose. The letters are a picture of a
 * name, not the name; the control around this carries the accessible name, and
 * announcing "D" before it would be reading out the drawing.
 */
export const Avatar = ({ name, size = 26, filled = false }: AvatarProps): JSX.Element => (
  <span
    className={`avatar${filled ? " avatar--filled" : ""}`}
    // The only thing about this shape that a caller varies. A class per size
    // would be two names for one number the day a third size existed.
    style={{ "--avatar-size": `${String(size)}px` } as CSSProperties}
    aria-hidden="true"
  >
    {initialsOf(name)}
  </span>
);

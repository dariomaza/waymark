import { initialsOf } from "@waymark/api-client";
import type { JSX } from "react";

import "./avatar.css";

export interface AvatarProps {
  /** Whatever the person is called. The letters are derived, never passed in. */
  readonly name: string;
}

/**
 * A person, as one or two letters.
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
 * Hidden from assistive technology on purpose. The letters are a picture of a
 * name, not the name; the control around this carries the accessible name,
 * and announcing "D" before it would be reading out the drawing.
 */
export const Avatar = ({ name }: AvatarProps): JSX.Element => (
  <span className="avatar" aria-hidden="true">
    {initialsOf(name)}
  </span>
);

import type { JSX, ReactNode } from "react";
import { Link } from "react-router-dom";

import { Icon, type IconName } from "./icon.js";
import "./quiet-link.css";

export interface QuietLinkProps {
  readonly to: string;
  /**
   * Beside the word, never instead of it.
   *
   * Required here, unlike on a `Button`. A control with no rectangle around it
   * has nothing but its words to say it is a control at all, and small words
   * with nothing beside them read as a caption; the shape is what makes this
   * one look pressable. If no honest picture exists for a destination, that is
   * a reason to widen the icon set (ADR 20), not to leave this off.
   */
  readonly icon: IconName;
  readonly children: ReactNode;
}

/**
 * # A second PLACE, rather than a second action
 *
 * ADR 21 gave every screen one primary action and at most one secondary, and
 * drew the secondary as an outlined rectangle. That is the right shape for a
 * second thing to DO and the wrong one for a second place to GO — two
 * rectangles side by side say the two controls are the same kind of thing, and
 * a person then reads both to find out which is which, which is the state that
 * ADR was written to end.
 *
 * The owner put it in one sentence, about the home screen:
 *
 * > lo mejor sería el botón principal en grande y lo de las etiquetas en
 * > pequeñito con un icono al lado
 *
 * So: this. A word, a picture beside it, no fill and no edge. It is for a
 * route that is a different errand from the one the screen is for — a sheet of
 * labels from the inventory, a queue of failed photographs from a photo — and
 * not for anything that acts on what the screen is showing. Those belong in
 * the subject's own menu, which is the other half of the same ADR.
 *
 * ## It is small to LOOK at and not small to hit
 *
 * The one thing that does not shrink with the rest is the target. Visual
 * weight and touch area are different measurements, and this is the shape
 * where they are easiest to confuse: small text beside a small picture looks
 * like something that should be the height of a line of text. It keeps the
 * same 48px floor every `Button` in this app has, because a thumb is about 9mm
 * across and this is used standing up, holding a box, in a garage.
 *
 * The ink is `--color-accent-text` and not the muted grey, because muted grey
 * is what this app says "not a control" with. A quiet control is still a
 * control, and the accent as a FOREGROUND is exactly the job that token was
 * split out to do (see `tokens.css`).
 */
export const QuietLink = ({ to, icon, children }: QuietLinkProps): JSX.Element => (
  <Link className="quiet-link" to={to}>
    <Icon name={icon} size={18} />
    {children}
  </Link>
);

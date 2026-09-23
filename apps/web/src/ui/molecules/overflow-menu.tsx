import { useState, type JSX } from "react";
import { Link } from "react-router-dom";

import { Button, type ButtonTone } from "../atoms/button.js";
import { Icon, type IconName } from "../atoms/icon.js";
import { Sheet } from "../organisms/sheet.js";
import "./overflow-menu.css";

/**
 * One line in the menu: a word, and either something to do or somewhere to go.
 *
 * The word is always the caller's, out of the dictionary. Nothing in this file
 * writes a sentence, because a molecule that knows what "Delete" is called
 * knows one language.
 */
export interface OverflowAction {
  readonly label: string;
  /** In FRONT of the word, never instead of it. Left out where no shape is honest. */
  readonly icon?: IconName | undefined;
  /** The colour. `danger` is the one that deletes; most lines want none of it. */
  readonly tone?: ButtonTone | undefined;
  /**
   * This line takes something away.
   *
   * Separate from `tone` because they answer different questions. `tone` is
   * what it LOOKS like — emptying a box deletes nothing, so painting it red
   * would be a lie. This is what it COSTS, and it is what decides that the
   * line is drawn at the far end of the menu, behind a rule, where a thumb
   * aiming at anything else cannot reach it.
   */
  readonly destructive?: boolean | undefined;
  readonly onSelect?: (() => void) | undefined;
  /** A route, when the line is a way somewhere rather than an act. */
  readonly to?: string | undefined;
}

export interface OverflowMenuProps {
  /**
   * The accessible name of the control AND the heading of the panel it opens.
   *
   * One string for both on purpose. A screen reader announces the control, and
   * then reads the heading of what opened; two strings would be two chances to
   * say something slightly different about the same thing.
   *
   * It names the SUBJECT — "More actions for Box 3" — because three dots say
   * nothing on their own, and "More" is not a name that tells two controls on
   * one page apart.
   */
  readonly label: string;
  readonly actions: readonly OverflowAction[];
}

/**
 * # Everything a screen can do that is not the thing the screen is FOR
 *
 * A storage unit had nine actions on it, every one of them a word in a
 * rectangle of the same size, in a wrapping row that on a phone in Spanish
 * became nine rectangles stacked down the screen. That is not a CSS problem.
 * Nine peers cannot be laid out well, because the layout was being asked to
 * express a priority nobody had decided. ADR 21 decides it, and this is where
 * the decision is kept: one primary, at most one secondary, and everything
 * else behind this.
 *
 * ## Why it opens a sheet and not an ARIA `menu`
 *
 * A true `role="menu"` is a roving `tabindex` and a set of arrow-key
 * behaviours nobody would get right twice, and the reward for getting it right
 * is a small list hanging off a control near the top of the screen — which on
 * a phone held one-handed is the part of the screen a thumb cannot reach.
 *
 * `Sheet` is already the answer to both. It comes up from the BOTTOM, where
 * the thumb is; it already traps Tab, closes on Escape, hands the focus back
 * to whatever opened it, and portals itself out of the sticky chrome that once
 * cut a panel in half on a real phone. Every question this app asks is asked
 * with it, so an overflow that used anything else would be the one panel that
 * behaved differently.
 *
 * So the control says `aria-haspopup="dialog"`, which is what it does, and the
 * lines inside are ordinary buttons and links a keyboard already knows how to
 * walk. The cost is stated in the ADR: this is a dialog, so it dims the screen
 * behind it, which is more ceremony than a dropdown for "Edit".
 *
 * ## Destructive lines are last, and set apart
 *
 * Not decoration either. The rule the ADR states is that nothing which takes
 * something away may sit where a thumb reaching for the primary action can
 * land on it — so `delete` and `empty` are not merely in here, they are at the
 * far end of here, behind a rule, after a gap. The ORDER is the caller's, and
 * the gap is this file's: a caller that puts a destructive line in the middle
 * gets a rule in the middle, which is the kind of wrong somebody notices.
 */
export const OverflowMenu = ({ label, actions }: OverflowMenuProps): JSX.Element => {
  const [open, setOpen] = useState(false);

  const close = (): void => {
    setOpen(false);
  };

  return (
    <>
      <Button
        tone="quiet"
        className="overflow-menu__trigger"
        icon="more"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
        }}
      />

      {open ? (
        <Sheet title={label} onClose={close}>
          {/*
            A list, so a screen reader says "list, seven items" before reading
            the first one. Somebody who cannot see the panel then knows how far
            it goes before deciding to walk it.
          */}
          <ul className="overflow-menu">
            {actions.map((action) => (
              <li
                className={
                  action.destructive === true
                    ? "overflow-menu__line overflow-menu__line--apart"
                    : "overflow-menu__line"
                }
                key={action.label}
              >
                {action.to === undefined ? (
                  <Button
                    block
                    tone={action.tone ?? "secondary"}
                    {...(action.icon === undefined ? {} : { icon: action.icon })}
                    onClick={() => {
                      close();
                      action.onSelect?.();
                    }}
                  >
                    {action.label}
                  </Button>
                ) : (
                  // A way somewhere stays a link: it is a URL, it belongs in
                  // the history, and turning it into a button would take that
                  // away for the sake of one shared shape.
                  <Link
                    className="button button--secondary button--block"
                    to={action.to}
                    onClick={close}
                  >
                    {action.icon === undefined ? null : <Icon name={action.icon} size={18} />}
                    {action.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Sheet>
      ) : null}
    </>
  );
};

import { useState, type JSX } from "react";
import { StyleSheet, View } from "react-native";

import { Button, type ButtonTone } from "../atoms/button.js";
import type { IconName } from "../atoms/icon.js";
import { Sheet } from "../organisms/sheet.js";
import { colors, space } from "../styles/tokens.js";

/**
 * One line in the menu: a word, and something to do.
 *
 * The word is always the caller's, out of the dictionary. Nothing in this file
 * writes a sentence, because a molecule that knows what "Delete" is called
 * knows one language.
 *
 * There is no `to` here, unlike the browser's. This client navigates with a
 * callback rather than a URL, so a way somewhere IS an `onSelect`.
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
  readonly onSelect: () => void;
}

export interface OverflowMenuProps {
  /**
   * The accessible name of the control AND the heading of the panel it opens.
   *
   * One string for both on purpose: a screen reader announces the control and
   * then reads the heading of what opened, and two strings would be two
   * chances to say something slightly different about the same thing. It names
   * the SUBJECT, because three dots say nothing on their own.
   */
  readonly label: string;
  readonly actions: readonly OverflowAction[];
}

/**
 * # Everything a screen can do that is not the thing the screen is FOR
 *
 * A storage unit offered six controls stacked down the phone, every one of
 * them a word in a rectangle of the same size. That is a wall a thumb has to
 * READ to use, and it is not a spacing problem: six peers cannot be laid out
 * well, because the layout was being asked to express a priority nobody had
 * decided. ADR 21 decides it, and this is where the decision is kept.
 *
 * It opens the `Sheet` every question in this app is already asked with —
 * bottom of the screen, where a thumb is; `accessibilityViewIsModal`, so a
 * screen reader stops at its edge; and `onRequestClose`, so the back gesture
 * closes it the way the back gesture closes everything else on this platform.
 * An overflow that invented its own panel would be the one panel that behaved
 * differently, for no gain.
 *
 * The lines are ordinary buttons. Destructive ones are drawn last and behind a
 * rule, because distance is the only guard a touch screen has — there is no
 * hover to hesitate in and no cursor to aim with.
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
        icon="more"
        label={label}
        onPress={() => {
          setOpen(true);
        }}
      />

      {open ? (
        <Sheet title={label} onClose={close}>
          <View style={styles.list}>
            {actions.map((action, index) => (
              <View
                key={action.label}
                style={
                  // The gap and the rule open the group ONCE, however many
                  // destructive lines follow: two rules in a row would read as
                  // two groups rather than as one.
                  action.destructive === true && actions[index - 1]?.destructive !== true
                    ? styles.apart
                    : null
                }
              >
                <Button
                  block
                  align="start"
                  tone={action.tone ?? "secondary"}
                  {...(action.icon === undefined ? {} : { icon: action.icon })}
                  onPress={() => {
                    close();
                    action.onSelect();
                  }}
                >
                  {action.label}
                </Button>
              </View>
            ))}
          </View>
        </Sheet>
      ) : null}
    </>
  );
};

const styles = StyleSheet.create({
  list: { gap: space.s2 },
  apart: {
    marginTop: space.s3,
    paddingTop: space.s3,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
});

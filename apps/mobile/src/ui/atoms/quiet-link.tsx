import type { JSX } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { Icon, type IconName } from "./icon.js";
import { colors, space, TAP_TARGET, text } from "../styles/tokens.js";

export interface QuietLinkProps {
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
  readonly onPress: () => void;
  readonly children: string;
  /** When the word a person hears should differ from the one they read. */
  readonly label?: string | undefined;
}

/**
 * # A second PLACE, rather than a second action
 *
 * The browser's twin of this file carries the full argument. In short: ADR 21
 * gave every screen one primary action and at most one secondary, and drew the
 * secondary as an outlined rectangle — the right shape for a second thing to
 * DO and the wrong one for a second place to GO. Two rectangles side by side
 * say the two controls are the same kind of thing, so a person reads both to
 * find out which is which.
 *
 * That ADR named a second site for the shape, on a screen that exists on BOTH
 * clients — the note under a photograph whose background removal failed, where
 * "See every photo that failed" was a `quiet` Button doing this job with a
 * button's clothes on. It was left alone at the time because nobody had
 * complained about that screen. This client had no such atom at all, so the
 * same errand was a rectangle here and a word with a picture there; ADR 22
 * closes that.
 *
 * ## It is a route, never an act
 *
 * Anything that does something to what the screen is showing belongs in that
 * thing's menu, which is the other half of ADR 21. This is for a way somewhere
 * the screen is not for.
 *
 * It says `link` and takes an `onPress`, which is not a contradiction: this
 * client navigates with a callback and the browser navigates with a URL.
 * Intent is what the two clients owe each other; mechanism is not.
 *
 * ## It is small to LOOK at and not small to hit
 *
 * The one thing that does not shrink with the rest is the target. Visual
 * weight and touch area are different measurements, and this is the shape
 * where they are easiest to confuse: small text beside a small picture looks
 * like something that should be the height of a line of text. It keeps the
 * same 48 floor every `Button` in this app has.
 *
 * The ink is `accentText` and not the muted grey, because muted grey is how
 * this app draws things that are NOT controls, and a quiet control is still a
 * control.
 */
export const QuietLink = ({ icon, onPress, children, label }: QuietLinkProps): JSX.Element => (
  <Pressable
    role="link"
    accessibilityLabel={label ?? children}
    onPress={onPress}
    style={({ pressed }) => [styles.link, pressed ? styles.pressed : null]}
  >
    {/*
      Hidden from assistive technology: the word is right beside it, and
      announcing both says the same thing twice. The same rule `Button` keeps.
    */}
    <Icon name={icon} size={18} color={colors.accentText} />
    <Text style={styles.word}>{children}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  link: {
    minHeight: TAP_TARGET,
    minWidth: TAP_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: space.s2,
    /*
      Horizontal only. The height is already the target, so padding here is
      about not butting up against whatever sits next to it. No background and
      no border, which is the whole point of the shape.
    */
    paddingHorizontal: space.s2,
  },
  pressed: { opacity: 0.7 },
  word: { color: colors.accentText, fontSize: text.s },
});

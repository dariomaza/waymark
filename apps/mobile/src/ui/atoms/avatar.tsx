import { initialsOf } from "@waymark/api-client";
import type { JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, space, text } from "../styles/tokens.js";

export interface AvatarProps {
  /** Whoever this stands for. The initials are read off it. */
  readonly name: string;
  /** Points, square. Defaults to the size that reads in the bottom bar. */
  readonly size?: number;
  /** The ink and the ring. The page's muted ink unless a caller means something. */
  readonly color?: string;
  /**
   * What this avatar MEANS, when it carries meaning on its own.
   *
   * Left out, it is hidden from assistive technology — which is right whenever
   * the thing around it is already named, because "DM" read aloud is two
   * letters and announcing them before the name they abbreviate is announcing
   * the abbreviation instead of the answer. Same rule, and the same two props,
   * as `Icon`.
   */
  readonly label?: string | undefined;
  /**
   * A solid disc rather than a ring.
   *
   * The ring is right in the tab bar and wrong everywhere else, which is why
   * this is a prop and not a second component. See the note below.
   */
  readonly filled?: boolean;
}

/**
 * A person, as a circle with their initial in it.
 *
 * The initials come from `initialsOf` in `@waymark/api-client` — the same
 * function the item cards use for a thing with no photograph. A second one
 * here would be a second set of rules about punctuation, emoji and
 * uppercasing, agreeing right up until the day somebody fixed one of them.
 *
 * A ring rather than a filled disc, BY DEFAULT: filled, at the size it is
 * drawn in the tab bar, in the accent, it reads as the selected tab whichever
 * tab you are actually on.
 *
 * That argument is about the bar and only about the bar. It does not reach the
 * 44pt instance on the account screen, which is not competing with a selected
 * state and which the browser has always drawn as a filled lime disc — so that
 * one asks for `filled`, and the circle you tapped and the circle you arrived
 * at are the same drawing on both clients (ADR 22).
 */
export const Avatar = ({
  name,
  size = 26,
  color = colors.inkMuted,
  label,
  filled = false,
}: AvatarProps): JSX.Element => (
  <View
    style={[
      styles.ring,
      filled ? styles.filled : null,
      { width: size, height: size, borderRadius: size / 2 },
      filled ? null : { borderColor: color },
    ]}
    accessible={label !== undefined}
    accessibilityElementsHidden={label === undefined}
    importantForAccessibility={label === undefined ? "no-hide-descendants" : "yes"}
    {...(label === undefined ? {} : { accessibilityRole: "image" as const, accessibilityLabel: label })}
  >
    <Text style={[styles.initials, { color: filled ? colors.accentInk : color }]} numberOfLines={1}>
      {initialsOf(name)}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  ring: {
    borderWidth: 1.7,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.s1 / 2,
  },
  /** The accent's own ink on the accent, which is 13.85 in either scheme. */
  filled: { backgroundColor: colors.accent, borderWidth: 0 },
  initials: { fontSize: text.s - 2, fontWeight: "700" },
});

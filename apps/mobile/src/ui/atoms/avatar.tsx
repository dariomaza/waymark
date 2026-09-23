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
}

/**
 * A person, as a circle with their initial in it.
 *
 * The initials come from `initialsOf` in `@waymark/api-client` — the same
 * function the item cards use for a thing with no photograph. A second one
 * here would be a second set of rules about punctuation, emoji and
 * uppercasing, agreeing right up until the day somebody fixed one of them.
 *
 * A ring rather than a filled disc: filled, at this size, in the accent, it
 * reads as the selected tab whichever tab you are actually on.
 */
export const Avatar = ({ name, size = 26, color = colors.inkMuted, label }: AvatarProps): JSX.Element => (
  <View
    style={[
      styles.ring,
      { width: size, height: size, borderRadius: size / 2, borderColor: color },
    ]}
    accessible={label !== undefined}
    accessibilityElementsHidden={label === undefined}
    importantForAccessibility={label === undefined ? "no-hide-descendants" : "yes"}
    {...(label === undefined ? {} : { accessibilityRole: "image" as const, accessibilityLabel: label })}
  >
    <Text style={[styles.initials, { color }]} numberOfLines={1}>
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
  initials: { fontSize: text.s - 2, fontWeight: "700" },
});

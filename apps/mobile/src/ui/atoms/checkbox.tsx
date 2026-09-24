import type { JSX } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "./icon.js";
import { colors, radius, space, TAP_TARGET, text } from "../styles/tokens.js";

export interface CheckboxProps {
  /** Said out loud, and the whole accessible name. "Box 3", not "Tick". */
  readonly label: string;
  readonly checked: boolean;
  readonly onPress: () => void;
}

/**
 * # One thing, ticked or not
 *
 * The browser's twin is a real `<input type="checkbox">` inside a `<label>`;
 * React Native has no such element, so the row is a `Pressable` that says
 * `checkbox` and carries its own state. What a screen reader is told is the
 * same on both clients, which is what the two owe each other.
 *
 * The WHOLE ROW is the control and not the little square at the start of it —
 * the same argument `Toggle` makes. A 20pt box is a target somebody standing on
 * a step ladder misses, so the row carries the floor and the square is only the
 * picture of the state.
 *
 * The tick is hidden from assistive technology because the row already
 * announces whether it is checked; announcing a picture of the same fact says
 * it twice.
 */
export const Checkbox = ({ label, checked, onPress }: CheckboxProps): JSX.Element => (
  <Pressable
    role="checkbox"
    accessibilityLabel={label}
    accessibilityState={{ checked }}
    onPress={onPress}
    style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
  >
    <View style={[styles.box, checked ? styles.boxOn : null]}>
      {checked ? <Icon name="check" size={16} color={colors.accentInk} /> : null}
    </View>
    <Text style={styles.label}>{label}</Text>
  </Pressable>
);

const BOX = 22;

const styles = StyleSheet.create({
  row: {
    minHeight: TAP_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: space.s3,
    flexShrink: 1,
  },
  pressed: { opacity: 0.7 },
  box: {
    width: BOX,
    height: BOX,
    borderRadius: radius.s,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceSunken,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  // The name takes whatever is left, so a long one wraps rather than pushing
  // "everything inside" off the side of a phone.
  label: { color: colors.ink, fontSize: text.m, flexShrink: 1 },
});

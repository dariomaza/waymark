import type { JSX } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, radius, space, TAP_TARGET, text } from "../styles/tokens.js";

export interface Option {
  readonly value: string;
  readonly label: string;
}

export interface OptionListProps {
  readonly label: string;
  /**
   * One line under the label about what the choice MEANS, when the options on
   * their own would be read as something they are not.
   *
   * The kind picker is the reason it exists: Room, Furniture, Box, Container
   * reads as a constraint on what may hold what, and it is not one. The web
   * client has carried that sentence under its `<select>` since the day it was
   * written, through `aria-describedby`; here it is drawn and announced as an
   * `accessibilityHint`, which is what React Native calls the same idea.
   */
  readonly hint?: string | undefined;
  readonly options: readonly Option[];
  readonly value: string | null;
  readonly onChange: (value: string) => void;
}

/**
 * A list of choices, drawn as rows rather than hidden behind a picker.
 *
 * The web client uses a `<select>`; on Android that opens a modal wheel, and
 * every option in this app is a full path — `Garage > Metal wardrobe > Box 3`
 * — which a wheel truncates to the first two words. Truncating the path is
 * exactly the thing that makes a picker a coin toss between three boxes all
 * called `Box 3`, so the rows stay visible and scroll.
 *
 * Each row is a radio, so a screen reader says whether it is the chosen one.
 */
export const OptionList = ({
  label,
  hint,
  options,
  value,
  onChange,
}: OptionListProps): JSX.Element => (
  <View style={styles.wrap}>
    <Text style={styles.label}>{label}</Text>
    {hint === undefined ? null : <Text style={styles.hint}>{hint}</Text>}
    <ScrollView
      style={styles.list}
      accessibilityLabel={label}
      {...(hint === undefined ? {} : { accessibilityHint: hint })}
    >
      {options.map((option) => (
        <Pressable
          key={option.value}
          role="radio"
          accessibilityLabel={option.label}
          accessibilityState={{ selected: option.value === value, checked: option.value === value }}
          onPress={() => {
            onChange(option.value);
          }}
          style={[styles.row, option.value === value ? styles.chosen : null]}
        >
          <Text style={styles.rowText}>{option.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  </View>
);

const styles = StyleSheet.create({
  wrap: { gap: space.s1 },
  label: { color: colors.ink, fontSize: text.s, fontWeight: "600" },
  hint: { color: colors.inkMuted, fontSize: text.s },
  list: {
    maxHeight: 240,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.m,
    backgroundColor: colors.surfaceSunken,
  },
  row: {
    minHeight: TAP_TARGET,
    justifyContent: "center",
    paddingHorizontal: space.s3,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  chosen: { backgroundColor: colors.surfaceRaised },
  rowText: { color: colors.ink, fontSize: text.m },
});

import type { JSX } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, radius, space, TAP_TARGET, text } from "../styles/tokens.js";

export interface Option {
  readonly value: string;
  readonly label: string;
}

export interface OptionListProps {
  readonly label: string;
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
  options,
  value,
  onChange,
}: OptionListProps): JSX.Element => (
  <View style={styles.wrap}>
    <Text style={styles.label}>{label}</Text>
    <ScrollView style={styles.list} accessibilityLabel={label}>
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

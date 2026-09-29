import type { JSX } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon, type IconName } from "./icon.js";
import { radius, space, TAP_TARGET, text } from "../styles/tokens.js";
import { themed } from "../styles/theme.js";

/** One answer: what it is called aloud, and what is drawn for it. */
export interface SegmentedOption<Value extends string> {
  readonly value: Value;
  /** The whole accessible name. Never drawn: the picture or the letters are. */
  readonly name: string;
  /** A picture from the icon set, or a few letters. Exactly one of the two. */
  readonly drawn: { readonly icon: IconName } | { readonly letters: string };
}

export interface SegmentedProps<Value extends string> {
  /** What the question is called, which is the group's accessible name. */
  readonly label: string;
  readonly value: Value;
  readonly options: readonly SegmentedOption<Value>[];
  readonly onChoose: (value: Value) => void;
}

/**
 * # One either-or setting, drawn one way
 *
 * The language was two 40-wide cells and the appearance three words beside
 * three pictures across the whole width: two controls for one kind of
 * question. This is both of them, so the two cannot disagree again — and it is
 * the browser's `ui/atoms/segmented.tsx`, at the same size, in the same shape.
 *
 * Each answer carries the radio role and its state, so a screen reader hears
 * the grouping and which one is chosen, as the browser's real radios give it
 * for free. Every answer is drawn as a picture or as two letters, never as a
 * word, and is CALLED by its whole name: "ES" read aloud is two letters, and a
 * sun is not a name.
 */
export const Segmented = <Value extends string>({
  label,
  value,
  options,
  onChoose,
}: SegmentedProps<Value>): JSX.Element => {
  const styles = useStyles();

  return (
    <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option, index) => {
        const chosen = value === option.value;
        const ink = chosen ? styles.chosenInk.color : styles.ink.color;

        return (
          <Pressable
            key={option.value}
            role="radio"
            accessibilityLabel={option.name}
            accessibilityState={{ selected: chosen, checked: chosen }}
            onPress={() => {
              onChoose(option.value);
            }}
            style={[styles.option, index > 0 ? styles.divided : null, chosen ? styles.chosen : null]}
          >
            {"icon" in option.drawn ? (
              <Icon name={option.drawn.icon} size={20} color={ink} />
            ) : (
              <Text style={[styles.letters, chosen ? styles.chosenInk : styles.ink]}>
                {option.drawn.letters}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
};

const useStyles = themed((colors) =>
  StyleSheet.create({
    // As wide as its answers, never the width of the row: two answers and
    // three are the same shape at two lengths.
    group: {
      flexDirection: "row",
      flexShrink: 0,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: radius.m,
      overflow: "hidden",
      backgroundColor: colors.surface,
    },
    // A thumb is about 9mm across: `TAP_TARGET` is the floor, as for a button.
    option: {
      minHeight: TAP_TARGET,
      minWidth: TAP_TARGET,
      paddingHorizontal: space.s2,
      alignItems: "center",
      justifyContent: "center",
    },
    divided: { borderLeftWidth: 1, borderLeftColor: colors.line },
    // The edge gives the lime a silhouette on the light page (1.26 alone).
    chosen: { backgroundColor: colors.accent, borderColor: colors.accentBorder },
    letters: { fontSize: text.s, fontWeight: "700", textAlign: "center" },
    ink: { color: colors.inkMuted },
    chosenInk: { color: colors.accentInk },
  }),
);

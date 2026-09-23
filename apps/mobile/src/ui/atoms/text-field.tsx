import type { JSX } from "react";
import type { ReactNode } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

import { colors, radius, space, TAP_TARGET, text } from "../styles/tokens.js";

export interface TextFieldProps extends Omit<TextInputProps, "style"> {
  /** What a screen reader says, and what a test asks for. */
  readonly label: string;
  readonly hint?: string | undefined;
  /** The API's own complaint about this field, when there is one. */
  readonly problem?: string | null | undefined;
  /**
   * A control drawn at the input's right-hand end, inside its border.
   *
   * The input reserves room for it with padding rather than letting it float
   * over the text, so a long value runs out of space instead of running
   * underneath a button.
   */
  readonly trailing?: ReactNode;
}

/**
 * A labelled input.
 *
 * The label is drawn AND carried as the accessible name, so the thing a person
 * reads and the thing a test asks for are the same string. Web does this with
 * a `<label for>`; React Native has no such association, so it is stated.
 */
export const TextField = ({
  label,
  hint,
  problem,
  trailing,
  ...rest
}: TextFieldProps): JSX.Element => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    {hint === undefined ? null : <Text style={styles.hint}>{hint}</Text>}
    <View>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.inkMuted}
        style={[
          styles.input,
          problem == null ? null : styles.inputWrong,
          trailing === undefined ? null : styles.inputWithTrailing,
        ]}
        {...rest}
      />
      {trailing === undefined ? null : <View style={styles.trailing}>{trailing}</View>}
    </View>
    {problem == null ? null : <Text style={styles.problem}>{problem}</Text>}
  </View>
);

const styles = StyleSheet.create({
  field: { gap: space.s1 },
  label: { color: colors.ink, fontSize: text.s, fontWeight: "600" },
  hint: { color: colors.inkMuted, fontSize: text.s },
  input: {
    minHeight: TAP_TARGET,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.m,
    backgroundColor: colors.surfaceSunken,
    color: colors.ink,
    paddingHorizontal: space.s3,
    fontSize: text.m,
  },
  /** Room for the control, so text stops before it rather than under it. */
  inputWithTrailing: { paddingRight: TAP_TARGET + space.s2 },
  /**
   * Pinned to the input's own box. The full tap target fits because the input
   * is already TAP_TARGET tall — which is what makes the usual objection to an
   * inset control ("it shrinks below the minimum") not apply here.
   */
  trailing: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: TAP_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  inputWrong: { borderColor: colors.danger },
  problem: { color: colors.danger, fontSize: text.s },
});

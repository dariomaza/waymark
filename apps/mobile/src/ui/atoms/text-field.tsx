import type { JSX } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

import { colors, radius, space, TAP_TARGET, text } from "../styles/tokens.js";

export interface TextFieldProps extends Omit<TextInputProps, "style"> {
  /** What a screen reader says, and what a test asks for. */
  readonly label: string;
  readonly hint?: string | undefined;
  /** The API's own complaint about this field, when there is one. */
  readonly problem?: string | null | undefined;
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
  ...rest
}: TextFieldProps): JSX.Element => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    {hint === undefined ? null : <Text style={styles.hint}>{hint}</Text>}
    <TextInput
      accessibilityLabel={label}
      placeholderTextColor={colors.inkMuted}
      style={[styles.input, problem == null ? null : styles.inputWrong]}
      {...rest}
    />
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
  inputWrong: { borderColor: colors.danger },
  problem: { color: colors.danger, fontSize: text.s },
});

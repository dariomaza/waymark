import type { JSX, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, space, TAP_TARGET, text } from "../styles/tokens.js";

/**
 * What a button MEANS, not what it looks like.
 *
 * `danger` is the one that deletes; `primary` is the one thing a screen wants
 * you to do. Every one of them is at least 48pt tall, because this app is used
 * one-handed, standing up, in a garage.
 */
export type ButtonTone = "primary" | "secondary" | "danger" | "quiet";

export interface ButtonProps {
  readonly tone?: ButtonTone;
  readonly block?: boolean;
  readonly disabled?: boolean;
  readonly onPress: () => void;
  readonly children: ReactNode;
  /**
   * When the label a person hears should differ from the one they read —
   * "Delete photo 2" beside a thumbnail that only says "Delete".
   */
  readonly label?: string | undefined;
}

export const Button = ({
  tone = "secondary",
  block = false,
  disabled = false,
  onPress,
  children,
  label,
}: ButtonProps): JSX.Element => (
  <Pressable
    role="button"
    accessibilityLabel={label ?? (typeof children === "string" ? children : undefined)}
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [
      styles.base,
      styles[tone],
      block ? styles.block : null,
      disabled ? styles.disabled : null,
      pressed ? styles.pressed : null,
    ]}
  >
    <View>
      <Text style={[styles.label, textStyles[tone]]}>{children}</Text>
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  base: {
    minHeight: TAP_TARGET,
    paddingHorizontal: space.s4,
    paddingVertical: space.s3,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  block: { alignSelf: "stretch" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  secondary: { backgroundColor: colors.surfaceRaised },
  danger: { backgroundColor: colors.surfaceRaised, borderColor: colors.danger },
  quiet: { backgroundColor: "transparent", borderColor: "transparent" },
  label: { fontSize: text.m, fontWeight: "600" },
});

const textStyles = StyleSheet.create({
  primary: { color: colors.accentInk },
  secondary: { color: colors.ink },
  danger: { color: colors.danger },
  quiet: { color: colors.inkMuted },
});

import type { JSX, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon, type IconName } from "./icon.js";
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
  readonly children?: ReactNode;
  /**
   * When the label a person hears should differ from the one they read —
   * "Delete photo 2" beside a thumbnail that only says "Delete". It is also
   * the whole accessible name of a button that has dropped its word for an
   * icon, and then it is not optional.
   */
  readonly label?: string | undefined;
  /**
   * A shape in FRONT of the word, never instead of it.
   *
   * A screen of eight identical word-buttons gives the eye nothing to aim at,
   * and a hand reaching for "Move" reads all eight to find it. A picture is
   * what makes one of them findable without reading — which is the whole of
   * what it is for here, and why it is hidden from assistive technology: the
   * word is already there, and announcing both says the same thing twice.
   *
   * A button MAY drop its word, but only by taking a `label` instead — an
   * icon with no accessible name is a control nobody using a screen reader
   * can press on purpose. See the sheet's close control.
   */
  readonly icon?: IconName;
  /**
   * Where the word sits inside the rectangle.
   *
   * `center` everywhere except a menu, where the lines are a LIST to be read
   * down rather than a set of peers to be scanned: a centred label in a
   * full-width rectangle gives the eye a different starting point on every
   * row, so finding one of seven means reading all seven. The browser says the
   * same thing in `overflow-menu.css` (ADR 22).
   */
  readonly align?: "center" | "start";
  /**
   * Takes an equal share of the row it is in, and fills its height.
   *
   * For a row of two controls, which the home screen now is: "quería que fueran
   * dos botones en línea". The browser gets this from a grid of two tracks and
   * needs nothing on the button; React Native has no grid, so each peer says it
   * here. `flexBasis: 0` is what makes the share EQUAL rather than proportional
   * to how long each label happens to be.
   *
   * Filling the height is the other half and it is the one that matters: with
   * only the width shared, a label that wraps to two lines makes one rectangle
   * taller than the other, and "a row of two peers at two heights is the one
   * thing a row of peers must not be" (ADR 22).
   */
  readonly share?: boolean;
}

export const Button = ({
  tone = "secondary",
  block = false,
  disabled = false,
  onPress,
  children,
  label,
  icon,
  align = "center",
  share = false,
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
      share ? styles.share : null,
      align === "start" ? styles.leading : null,
      disabled ? styles.disabled : null,
      pressed ? styles.pressed : null,
    ]}
  >
    <View style={styles.row}>
      {icon === undefined ? null : (
        <Icon name={icon} size={18} color={iconColors[tone]} />
      )}
      {children === undefined ? null : (
        <Text style={[styles.label, textStyles[tone]]}>{children}</Text>
      )}
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  base: {
    // Both directions. A button that has dropped its word for a picture has
    // nothing but its padding left to keep it wide enough to hit.
    minHeight: TAP_TARGET,
    minWidth: TAP_TARGET,
    paddingHorizontal: space.s4,
    // No vertical padding, which is what the browser has always done. With it,
    // a button whose label wrapped grew taller than the button beside it — two
    // controls in one row at two heights, which is the one thing a row of
    // peers must not be. The floor above does the work instead (ADR 22).
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: space.s2, flexShrink: 1 },
  block: { alignSelf: "stretch" },
  /** An equal share of the row's width, and the whole of its height. */
  share: { flexGrow: 1, flexBasis: 0, alignSelf: "stretch" },
  /**
   * A list is read down, so its words start where a list starts.
   *
   * `alignItems`, not `justifyContent`: this Pressable has no `flexDirection`,
   * so its main axis is vertical and `justifyContent` would move the label UP
   * rather than left. The cross axis is the horizontal one here.
   */
  leading: { alignItems: "flex-start" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  secondary: { backgroundColor: colors.surfaceRaised },
  danger: { backgroundColor: colors.surfaceRaised, borderColor: colors.danger },
  quiet: { backgroundColor: "transparent", borderColor: "transparent" },
  /**
   * `flexShrink` because a word must be allowed to wrap rather than run off the
   * side. React Native defaults a flex child to not shrinking, so a long label
   * in a narrow rectangle — "Añadir un espacio" in a half-width button at
   * 360px — would otherwise overflow instead of taking a second line.
   */
  label: { fontSize: text.m, fontWeight: "600", flexShrink: 1 },
});

const textStyles = StyleSheet.create({
  primary: { color: colors.accentInk },
  secondary: { color: colors.ink },
  danger: { color: colors.danger },
  quiet: { color: colors.inkMuted },
});

/**
 * The drawing takes the same ink as the word beside it. `currentColor` does
 * not exist here, so what the web gets from the cascade has to be stated —
 * and stated from the same table, or the two would drift the first time a
 * tone changed.
 */
const iconColors: Record<ButtonTone, string> = {
  primary: colors.accentInk,
  secondary: colors.ink,
  danger: colors.danger,
  quiet: colors.inkMuted,
};

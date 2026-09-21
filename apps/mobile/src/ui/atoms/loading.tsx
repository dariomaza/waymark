import type { JSX } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { colors, space, text } from "../styles/tokens.js";

/**
 * A spinner that says what it is waiting for.
 *
 * "Loading" alone tells somebody standing in a garage nothing; "Finding that
 * box" tells them whether to keep waiting.
 */
export const Loading = ({ label }: { readonly label: string }): JSX.Element => (
  <View accessibilityLabel={label} role="progressbar" style={styles.wrap}>
    <ActivityIndicator color={colors.accent} />
    <Text style={styles.label}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: space.s2, paddingVertical: space.s5 },
  label: { color: colors.inkMuted, fontSize: text.s },
});

import type { JSX } from "react";
import { StyleSheet, Text } from "react-native";

import { colors, text } from "../styles/tokens.js";

/**
 * The name of what is on the screen, announced as a heading.
 *
 * React Native has no `<h1>`, so the role is stated rather than implied — and
 * it is what lets a test say "a person ended up looking at Box 3".
 */
export const ScreenTitle = ({ children }: { readonly children: string }): JSX.Element => (
  <Text accessibilityRole="header" style={styles.title}>
    {children}
  </Text>
);

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: text.xl, fontWeight: "700" },
});

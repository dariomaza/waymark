import type { JSX } from "react";
import { StyleSheet, Text } from "react-native";

import { text } from "../styles/tokens.js";
import { themed } from "../styles/theme.js";

/**
 * The name of what is on the screen, announced as a heading.
 *
 * React Native has no `<h1>`, so the role is stated rather than implied — and
 * it is what lets a test say "a person ended up looking at Box 3".
 */
export const ScreenTitle = ({ children }: { readonly children: string }): JSX.Element => {
  const styles = useStyles();

  return (
    <Text accessibilityRole="header" style={styles.title}>
      {children}
    </Text>
  );
};

const useStyles = themed((colors) =>
  StyleSheet.create({
    title: { color: colors.ink, fontSize: text.xl, fontWeight: "700" },
  }),
);

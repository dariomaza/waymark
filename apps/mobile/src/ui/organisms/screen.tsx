import type { JSX, ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { colors, space } from "../styles/tokens.js";

/**
 * The frame every screen sits in: the dark surface, the gutter, and a scroll
 * view when there is more than fits.
 */
export const Screen = ({
  children,
  scroll = true,
}: {
  readonly children: ReactNode;
  readonly scroll?: boolean;
}): JSX.Element =>
  scroll ? (
    <ScrollView style={styles.surface} contentContainerStyle={styles.body}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.surface, styles.body]}>{children}</View>
  );

const styles = StyleSheet.create({
  surface: { flex: 1, backgroundColor: colors.surface },
  body: { padding: space.s4, gap: space.s4 },
});

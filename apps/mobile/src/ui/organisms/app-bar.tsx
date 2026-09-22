import type { JSX, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "../atoms/icon.js";
import { colors, space, text } from "../styles/tokens.js";

export interface AppBarProps {
  readonly title: string;
  readonly actions?: ReactNode;
}

/**
 * The top bar. Presentational to the bone: it is handed a title and some
 * controls and knows nothing about what any of them do.
 *
 * The mark is three waypoints on a descending path, which is what the product
 * is named after — and it is decorative here on purpose, because the name is
 * written beside it. An icon that repeats the word next to it makes a screen
 * reader say the same thing twice.
 *
 * It pads itself by the status bar inset rather than sitting inside a
 * `SafeAreaView`, because the screen below it must keep scrolling under the
 * navigation bar at the bottom; only the top edge is this component's problem.
 *
 * There is no light scheme to answer to. This app is dark always (see
 * `tokens.ts`): it is opened in a storage room at night as often as anywhere
 * else, and the camera screen is black either way.
 */
export const AppBar = ({ title, actions }: AppBarProps): JSX.Element => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingTop: insets.top + space.s2 }]}>
      <Icon name="waypoints" size={24} color={colors.accent} />
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <View style={styles.actions}>{actions}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s2,
    paddingHorizontal: space.s4,
    paddingBottom: space.s2,
    backgroundColor: colors.surfaceRaised,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  title: { color: colors.ink, fontSize: text.l, fontWeight: "700" },
  // Pushed to the far edge, where a thumb reaching across finds them.
  actions: { flex: 1, flexDirection: "row", justifyContent: "flex-end", gap: space.s2 },
});
